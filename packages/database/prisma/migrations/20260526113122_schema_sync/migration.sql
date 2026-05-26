-- CreateIndex
CREATE INDEX "IndexedResource_provider_idx" ON "IndexedResource"("provider");

-- CreateIndex
CREATE INDEX "ToolInvocation_executionId_idx" ON "ToolInvocation"("executionId");

-- CreateIndex
CREATE INDEX "UserConnection_providerId_idx" ON "UserConnection"("providerId");
