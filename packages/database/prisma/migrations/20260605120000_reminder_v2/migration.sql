-- CreateEnum
CREATE TYPE "ReminderRecurrence" AS ENUM ('NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- AlterEnum
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- AlterTable Reminder
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "userPrompt" TEXT;
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "recurrence" "ReminderRecurrence" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "cronExpression" TEXT;
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "nextFireAt" TIMESTAMP(3);
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "lastFiredAt" TIMESTAMP(3);
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Migrate fireAt to nextFireAt
UPDATE "Reminder" SET "nextFireAt" = "fireAt" WHERE "nextFireAt" IS NULL;

ALTER TABLE "Reminder" ALTER COLUMN "nextFireAt" SET NOT NULL;
ALTER TABLE "Reminder" DROP COLUMN IF EXISTS "fireAt";

-- CreateTable DevicePushToken
CREATE TABLE IF NOT EXISTS "DevicePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "prefs" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX IF NOT EXISTS "DevicePushToken_userId_idx" ON "DevicePushToken"("userId");

ALTER TABLE "DevicePushToken" DROP CONSTRAINT IF EXISTS "DevicePushToken_userId_fkey";
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Reminder_userId_idx";
DROP INDEX IF EXISTS "Reminder_fireAt_idx";
CREATE INDEX IF NOT EXISTS "Reminder_userId_status_deletedAt_idx" ON "Reminder"("userId", "status", "deletedAt");
CREATE INDEX IF NOT EXISTS "Reminder_nextFireAt_idx" ON "Reminder"("nextFireAt");
