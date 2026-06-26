export type EmailCategory = 'PROCESO_SELECCION' | 'PRUEBA_TECNICA' | 'ENTREVISTA_AGENDADA' | 'SPAM_PUBLICIDAD' | 'OTROS';

export type PriorityLevel = 'ALTA' | 'MEDIA' | 'BAJA';

export interface IAAnalysisResult {
    category: EmailCategory;
    priority: PriorityLevel;
    summary: string;
    actionRequired: string
    deadline: string | null;
}