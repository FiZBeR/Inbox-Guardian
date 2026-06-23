import { ImapFlow } from "imapflow";

export class EmailListenerServices {

    private static client: ImapFlow | null = null;

    public static async start(): Promise<void> {

        if (this.client) {
            console.log("El servicio de escucha ya se encuentra corriendo");
            return
        }

        console.log("Credenciales: " + process.env.EMAIL_USER + " " + process.env.EMAIL_APP_PASSWORD);
        
        this.client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            logger: false, // Puedes cambiarlo a true si necesitas debuguear a bajo nivel en la consola
            auth: {
                user: process.env.EMAIL_USER!,
                pass: process.env.EMAIL_APP_PASSWORD!,
            },
        });

        try {
            console.log("Conectando al servidor de Hotmail!");
            await this.client.connect();

            await this.client.mailboxOpen('INBOX', { readOnly: true });
            console.log("Conexion IMAP establecida con exito...");


            this.client.on('exists', async (data) => {
                await this.processNewEmails();
            });

            this.client.on('close', () => {
                console.log('❌ Conexión IMAP cerrada de manera inesperada. Intentando reconectar...');
                this.handleReconnection();
            });

            this.client.on('error', (err) => {
                console.error('💥 Error crítico en la conexión IMAP:', err);
            });

        } catch (error) {
            console.error('❌ Error al intentar inicializar el servicio IMAP:', error);
            this.handleReconnection();
        }
    }

    /**
   * Método encargado de buscar correos no leídos y procesarlos uno por uno
   */
    /**
   * Método encargado de buscar correos no leídos y procesarlos uno por uno
   */
    private static async processNewEmails(): Promise<void> {
        if (!this.client) return;

        try {
            // CORRECCIÓN 1: En ImapFlow se usa 'seen: false' en lugar de 'unseen: true'
            const searchResults = await this.client.search({ seen: false });

            if (!searchResults || searchResults.length === 0) {
                console.log('🤷 No se encontraron nuevos correos no leídos para procesar.');
                return;
            }

            console.log(`🔍 Encontrados ${searchResults.length} correos sin leer. Analizando estructuras...`);

            for (const uid of searchResults) {
                const emailData = await this.client.fetchOne(uid.toString(), {
                    envelope: true,
                    source: false,
                    bodyStructure: true
                });

                // CORRECCIÓN 2: Validamos que exista tanto el objeto como su cabecera 'envelope'
                if (!emailData || !emailData.envelope) {
                    console.log(`⚠️ No se pudo obtener el envelope para el correo con UID: ${uid}`);
                    continue;
                }

                const messageId = emailData.envelope.messageId;
                console.log(`📬 Evaluando correo con Message-ID: ${messageId}`);

                // TODO: Aquí conectaremos con Prisma para verificar que no esté repetido
                // prisma.emailLog.findUnique({ where: { messageId } })

                // TODO: Aquí llamaremos a Gemini si pasa los filtros de base de datos
            }

        } catch (error) {
            console.error('❌ Falló el procesamiento de los correos nuevos:', error);
        }
    }

    /**
     * Lógica para manejar re-conexiones automáticas con un delay seguro
     */
    private static handleReconnection(): void {
        // Limpiamos el cliente viejo
        this.client = null;
        console.log('🔄 Programando intento de reconexión en 10 segundos...');

        setTimeout(async () => {
            await this.start();
        }, 10000); // Espera 10 segundos antes de volver a martillar el servidor de Microsoft
    }
}
