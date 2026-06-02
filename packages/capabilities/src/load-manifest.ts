import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestCapability {
  id: string;
  domain: string;
  description: string;
  risk: string;
  requiresConfirmation: boolean;
  plannerVisible: boolean;
  resultSchema: string;
  providers: Array<{
    providerId: string;
    adapterAction: string;
    executionTool: string;
  }>;
}

export interface CapabilityManifestFile {
  version: number;
  generatedAt: string;
  capabilities: ManifestCapability[];
}

let cached: CapabilityManifestFile | null = null;

export function loadCapabilityManifest(manifestPath?: string): CapabilityManifestFile {
  if (cached && !manifestPath) return cached;
  const path =
    manifestPath ??
    join(__dirname, '..', 'generated', 'capability-manifest.json');
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as CapabilityManifestFile;
  if (!manifestPath) cached = parsed;
  return parsed;
}

export function manifestCapabilityIds(plannerOnly = true): string[] {
  const m = loadCapabilityManifest();
  return m.capabilities
    .filter((c) => !plannerOnly || c.plannerVisible)
    .map((c) => c.id);
}
