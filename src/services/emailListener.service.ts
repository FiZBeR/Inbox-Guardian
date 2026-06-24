import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { inboxClassification } from "./ai.service.js";
import prisma from "../config/prisma.client.js";
import { DiscordService } from "./discord.service.js";

// Utilidad global para pausar asíncronamente
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class EmailListenerServices {
  private static client: ImapFlow | null = null;

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

          // ====================================================================
          // ⚡ BURBUJA DE PROTECCIÓN IA: Retry con Límite
          // ====================================================================
          let intentos = 0;
          const maxIntentos = 3;
          let iaResponseReady = false;
          let response: any = null;

          while (intentos < maxIntentos && !iaResponseReady) {
            try {
              response = await inboxClassification(emailtext);
              iaResponseReady = true; 
            } catch (error: any) {
              intentos++;
              const errorMessage = error.message || String(error);

              // Buscamos códigos clásicos de saturación de Gemini/Google
              if (errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('exhausted') || errorMessage.includes('Overloaded')) {
                console.warn(`⚠️ IA saturada o límite alcanzado (Intento ${intentos}/${maxIntentos}). Pausando 60 segundos...`);
                
                if (intentos < maxIntentos) {
                  await sleep(60000); // Pausa de 1 minuto usando la función global
                }
              } else {
                console.error('❌ Error crítico de la IA no relacionado con demanda:', errorMessage);
                break; // Rompe el while si el error es de sintaxis o de formato JSON
              }
            }
          }

          // Cláusula de guarda: Si la IA falló los 3 intentos, pasamos al siguiente correo
          if (!iaResponseReady || !response) {
            console.error(`❌ Se agotaron los intentos para el correo ${messageId}. Quedará pendiente para el próximo escaneo.`);
            continue; 
          }
          // ====================================================================

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
        
        // Pausa original entre correos normales para no saturar procesos
        await sleep(12000);
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