-- Integration platform schema

CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISCONNECTED');
CREATE TYPE "ToolInvocationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'FIRED', 'CANCELLED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "scopes" TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "encryptedCredentials" TEXT,
    "scopes" TEXT[],
    "metadata" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndexedResource" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "mimeType" TEXT,
    "url" TEXT,
    "modifiedAt" TIMESTAMP(3),
    "embeddingId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndexedResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "executionId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "status" "ToolInvocationStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "chatSessionId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL,
    "retries" JSONB,
    "rollback" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "steps" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndexedResource_connectionId_externalId_key" ON "IndexedResource"("connectionId", "externalId");
CREATE UNIQUE INDEX "ToolInvocation_executionId_key" ON "ToolInvocation"("executionId");
CREATE INDEX "UserConnection_userId_idx" ON "UserConnection"("userId");
CREATE INDEX "IndexedResource_connectionId_idx" ON "IndexedResource"("connectionId");
CREATE INDEX "FileAsset_userId_idx" ON "FileAsset"("userId");
CREATE INDEX "ToolInvocation_userId_idx" ON "ToolInvocation"("userId");
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");
CREATE INDEX "Reminder_fireAt_idx" ON "Reminder"("fireAt");
CREATE INDEX "Workflow_userId_idx" ON "Workflow"("userId");
CREATE INDEX "WorkflowRun_workflowId_idx" ON "WorkflowRun"("workflowId");

ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndexedResource" ADD CONSTRAINT "IndexedResource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "UserConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "UserConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "IntegrationProvider" ("id", "name", "authType", "scopes", "isEnabled", "updatedAt") VALUES
  ('google', 'Google Workspace', 'oauth2', ARRAY['gmail', 'calendar', 'drive'], true, CURRENT_TIMESTAMP),
  ('whatsapp', 'WhatsApp', 'device_link', ARRAY['messages'], true, CURRENT_TIMESTAMP),
  ('files', 'Files', 'local', ARRAY['read'], true, CURRENT_TIMESTAMP),
  ('notes', 'Notes', 'local', ARRAY['read', 'write'], true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
