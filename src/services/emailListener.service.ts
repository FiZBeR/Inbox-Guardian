import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { inboxClassification } from "./ai.service.js";
import prisma from "../config/prisma.client.js";
import { DiscordService } from "./discord.service.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class EmailListenerServices {
  private static client: ImapFlow | null = null;

  // ── NUEVO: backoff exponencial ante errores 429 / sobrecarga ─────────────
  private static async classifyWithRetry(text: string, maxRetries = 4) {
    let backoff = 30_000; // 30s inicial

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await inboxClassification(text);
      } catch (error: any) {
        const msg = error?.message || String(error);
        const isRateLimit =
          msg.includes("429") ||
          msg.includes("503") ||
          msg.includes("exhausted") ||
          msg.includes("Overloaded");

        if (isRateLimit && attempt < maxRetries - 1) {
          console.warn(`⚠️ IA saturada (intento ${attempt + 1}/${maxRetries}). Pausando ${backoff / 1000}s...`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 300_000); // tope 5 min
        } else {
          throw error;
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  public static async start(): Promise<void> {
    if (this.client) {
      console.log("El servicio de escucha ya se encuentra corriendo");
      return;
    }

    this.client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      logger: false,
      auth: {
        user: process.env.EMAIL_USER!,
        pass: process.env.EMAIL_APP_PASSWORD!,
      },
    });

    try {
      console.log("Conectando al servidor de Hotmail/Gmail!");
      await this.client.connect();

      await this.client.mailboxOpen("INBOX", { readOnly: true });
      console.log("Conexion IMAP establecida con exito...");

      this.client.on("exists", async (data) => {
        await this.processNewEmails();
      });

      this.client.on("close", () => {
        console.log("❌ Conexión IMAP cerrada de manera inesperada. Intentando reconectar...");
        this.handleReconnection();
      });

      this.client.on("error", (err) => {
        console.error("💥 Error crítico en la conexión IMAP:", err);
      });
    } catch (error) {
      console.error("❌ Error al intentar inicializar el servicio IMAP:", error);
      this.handleReconnection();
    }
  }

  private static async processNewEmails(): Promise<void> {
    if (!this.client) return;

    try {
      const searchResults = await this.client.search({ seen: false });

      if (!searchResults || searchResults.length === 0) {
        console.log("🤷 No se encontraron nuevos correos no leídos para procesar.");
        return;
      }

      console.log(`🔍 Encontrados ${searchResults.length} correos sin leer. Analizando estructuras...`);

      for (const uid of searchResults) {
        try {
          const emailData = await this.client.fetchOne(uid.toString(), {
            envelope: true,
            source: true,
            bodyStructure: true,
          });

          if (!emailData || !emailData.envelope || !emailData.source) {
            console.log(`⚠️ No se pudo obtener el envelope para el correo con UID: ${uid}`);
            continue;
          }

          const messageId = emailData.envelope.messageId || `inbox-guardian-uid-${uid}`;
          console.log(`📬 Evaluando correo con Message-ID: ${messageId}`);

          const existe = await prisma.emailLog.findUnique({
            where: { messageId },
          });
          
          if (existe) continue;

          const emailParse = await simpleParser(emailData.source!);
          const emailtext = emailParse.text || emailParse.textAsHtml || "";
          const remitente = emailParse.from?.value[0]?.address || "desconocido@email.com";

          if (!emailtext.trim()) {
            console.log(`🈳 El correo ${messageId} no tiene texto analizable. Saltando IA...`);
            continue;
          }

          // ── CAMBIO: reemplaza el bloque while por classifyWithRetry ─────────
          let response: any;
          try {
            response = await this.classifyWithRetry(emailtext);
          } catch {
            console.error(`❌ Se agotaron los intentos para el correo ${messageId}. Quedará pendiente para el próximo escaneo.`);
            continue;
          }
          // ────────────────────────────────────────────────────────────────────

          console.log(`✅ Clasificación terminada: Es un(a) ${response.category} con prioridad ${response.priority}`);

          if (response.category == "OTROS" || response.category == "SPAM_PUBLICIDAD") {
            continue;
          }

          await prisma.emailLog.create({
            data: {
              messageId: messageId,
              category: response.category,
              priority: response.priority,
              aiSummary: response.summary,
              actionRequired: response.actionRequired,
              deadline: response.deadline,
              fromEmail: remitente,
            },
          });

          await DiscordService.sendAlert(messageId, response);
          console.log(`🚀 Flujo completo terminado para el correo: ${messageId}`);
          
        } catch (error) {
          console.error(`❌ Falló el procesamiento del correo: ${uid}`, error);
        }
        
        await sleep(15000);
      }
    } catch (error) {
      console.error("❌ Falló el procesamiento de los correos nuevos:", error);
    }
  }

  private static handleReconnection(): void {
    this.client = null;
    console.log("🔄 Programando intento de reconexión en 10 segundos...");

    setTimeout(async () => {
      await this.start();
    }, 10000); 
  }
}