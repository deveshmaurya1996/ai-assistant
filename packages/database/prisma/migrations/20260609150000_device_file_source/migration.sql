-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "FileAsset" ADD COLUMN "devicePath" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "deviceModifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_userId_devicePath_key" ON "FileAsset"("userId", "devicePath");

-- CreateIndex
CREATE INDEX "FileAsset_userId_source_idx" ON "FileAsset"("userId", "source");
