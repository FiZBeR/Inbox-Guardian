import { IAAnalysisResult } from '../types/index.js'; // Ajusta tu ruta

export class DiscordService {
    /**
     * Envía una tarjeta interactiva a Discord usando el Webhook
     */
    public static async sendAlert(messageId: string, analysis: IAAnalysisResult): Promise<void> {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        
        if (!webhookUrl) {
            console.warn('⚠️ Webhook de Discord no configurado en el .env. Omitiendo alerta.');
            return;
        }

        // Lógica visual: Asignamos un color decimal basado en la urgencia
        let embedColor = parseInt('00FF00', 16); // Verde por defecto (BAJA)
        if (analysis.priority === 'ALTA') embedColor = parseInt('FF0000', 16); // Rojo
        if (analysis.priority === 'MEDIA') embedColor = parseInt('FFFF00', 16); // Amarillo

        // Construimos el Payload estricto que exige Discord
        const payload = {
            content: `🔔 **Inbox Guardian:** Nuevo correo detectado.`,
            embeds: [
                {
                    title: `Clasificación: ${analysis.category}`,
                    description: analysis.summary,
                    color: embedColor,
                    fields: [
                        {
                            name: "🚨 Prioridad",
                            value: analysis.priority,
                            inline: true
                        },
                        {
                            name: "🎯 Acción Requerida",
                            value: analysis.actionRequired,
                            inline: false // False para que ocupe toda la línea de la tarjeta
                        },
                        {
                            name: "⏳ Fecha Límite",
                            value: analysis.deadline ? analysis.deadline : "Ninguna",
                            inline: true
                        }
                    ],
                    footer: {
                        text: `Message ID: ${messageId}`
                    }
                }
            ]
        };

        try {
            // Usamos el fetch nativo de Node.js (Sin librerías extra)
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Discord rechazó la petición: ${response.statusText}`);
            }

            console.log('🚀 Alerta enviada a Discord exitosamente.');

        } catch (error) {
            console.error('❌ Falló el envío del Webhook a Discord:', error);
        }
    }
}