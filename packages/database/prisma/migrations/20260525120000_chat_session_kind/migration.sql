-- CreateEnum
CREATE TYPE "ChatSessionKind" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "kind" "ChatSessionKind" NOT NULL DEFAULT 'TEXT';
