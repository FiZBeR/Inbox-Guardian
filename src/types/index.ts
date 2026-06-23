export type EmailCategory = 'PROCESO_SELECCION' | 'PRUEBA_TECNICA' | 'ENTREVISTA_AGENDADA' | 'SPAM_PUBLICIDAD' | 'OTROS';

export type PriorityLevel = 'ALTA' | 'MEDIA' | 'BAJA';

export interface IAAnalysisResult {
    category: EmailCategory;
    level: PriorityLevel;
    summary: String;
    actionRequired: String
    deadline: String | null;
}