import { GoogleGenAI, Type } from '@google/genai'
import { IAAnalysisResult } from '../types/index.js'

const ai = new GoogleGenAI({
    apiKey: process.env.AI_KEY!
});

export const inboxClassification = async (correo: string): Promise<IAAnalysisResult> => {

    try {
        const fechaActual = new Date().toISOString();
        const capitalPrompt = `
            Eres un analista de reclutamiento experto. Tu trabajo es leer correos de mi bandeja de entrada 
            y extraer la información clave en formato estructurado. 
            Regla de tiempo: Hoy es ${fechaActual}. Si el correo menciona 'mañana' o 'próximo viernes', 
            calcula la fecha límite exacta (deadline) basándote en el día de hoy. Si no hay fecha, devuelve null.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: correo,
            config: {
                systemInstruction: capitalPrompt,
                responseMimeType: 'application/json', // Forzamos a la API a devolver solo JSON puro
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        category: {
                            type: Type.STRING,
                            description: "Clasifica el tipo de correo recibido.",
                            enum: ['PROCESO_SELECCION', 'PRUEBA_TECNICA', 'ENTREVISTA_AGENDADA', 'SPAM_PUBLICIDAD', 'OTROS']
                        },
                        priority: {
                            type: Type.STRING,
                            description: "Nivel de urgencia para responder o actuar.",
                            enum: ['ALTA', 'MEDIA', 'BAJA']
                        },
                        summary: {
                            type: Type.STRING,
                            description: "Un resumen ejecutivo del correo en máximo dos líneas."
                        },
                        actionRequired: {
                            type: Type.STRING,
                            description: "La acción inmediata que debo realizar (ej: 'Completar test en HackerRank')."
                        },
                        deadline: {
                            type: Type.STRING,
                            description: "Fecha límite calculada en formato ISO. Nulo si no existe.",
                            nullable: true
                        }
                    },
                    // Obligamos a que siempre devuelva estos campos
                    required: ["category", "priority", "summary", "actionRequired"] 
                }
            }
        });

        if (!response.text) {
            throw new Error('La IA devolvió una respuesta vacía.');
        }

        // Ya no necesitamos regex. El texto ES un JSON puro garantizado por la API.
        const responseReady = JSON.parse(response.text) as IAAnalysisResult;
        
        console.log('✅ Clasificación exitosa:', responseReady.category);
        return responseReady;

    } catch (error) {
        if(error instanceof Error){
            console.log(error.message);
        }

        throw new Error('Error en el servidor de la IA');
    }
}