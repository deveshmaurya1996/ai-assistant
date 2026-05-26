-- AlterTable
ALTER TABLE "UserNote" ADD COLUMN "sourceMessageId" TEXT;

-- CreateIndex
CREATE INDEX "UserNote_userId_sourceMessageId_idx" ON "UserNote"("userId", "sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_userId_sourceMessageId_key" ON "UserNote"("userId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
