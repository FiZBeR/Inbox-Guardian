-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('PROCESO_SELECCION', 'PRUEBA_TECNICA', 'ENTREVISTA_AGENDADA', 'SPAM_PUBLICITARIO', 'OTROS');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateTable
CREATE TABLE "EmailLog" (
    "id_emailLog" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "priority" "PriorityLevel" NOT NULL,
    "deadline" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id_emailLog")
);

-- CreateTable
CREATE TABLE "DiscordAlert" (
    "id_discord" SERIAL NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "emailLogId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordAlert_pkey" PRIMARY KEY ("id_discord")
);

-- CreateTable
CREATE TABLE "BlackList" (
    "id" TEXT NOT NULL,
    "emailOrDomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlackList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_messageId_key" ON "EmailLog"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAlert_discordMessageId_key" ON "DiscordAlert"("discordMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "BlackList_emailOrDomain_key" ON "BlackList"("emailOrDomain");

-- AddForeignKey
ALTER TABLE "DiscordAlert" ADD CONSTRAINT "DiscordAlert_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id_emailLog") ON DELETE RESTRICT ON UPDATE CASCADE;
