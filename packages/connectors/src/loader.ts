import fs from 'node:fs';
import path from 'node:path';
import type {
  ConnectorCatalogEntry,
  ConnectorDefinition,
  ConnectorManifest,
  ConnectorMeta,
} from './types';
import { deriveConnectorCapabilities } from './derive-capabilities';

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function resolveConnectorsRoot(explicitRoot?: string): string {
  if (explicitRoot && fs.existsSync(explicitRoot)) return explicitRoot;
  const envRoot = process.env.CONNECTORS_ROOT;
  if (envRoot && fs.existsSync(envRoot)) return envRoot;
  return path.join(findRepoRoot(process.cwd()), 'connectors');
}

function readMeta(connectorDir: string): ConnectorMeta {
  const metaPath = path.join(connectorDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Missing meta.json at ${connectorDir}`);
  }
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ConnectorMeta;
  if (!raw.id || !raw.providerIds?.length || !raw.domains?.length) {
    throw new Error(`Invalid meta.json at ${metaPath}`);
  }
  return raw;
}

function toManifest(meta: ConnectorMeta): ConnectorManifest {
  return {
    ...meta,
    capabilities: deriveConnectorCapabilities(meta),
  };
}

export function loadConnectorFromDirectory(connectorDir: string): ConnectorDefinition {
  const meta = readMeta(connectorDir);
  const manifest = toManifest(meta);
  const playbookPath = path.join(connectorDir, 'PLAYBOOK.md');
  const playbookMd = fs.existsSync(playbookPath) ? fs.readFileSync(playbookPath, 'utf8') : '';
  return {
    manifest,
    playbookMd,
    directory: connectorDir,
  };
}

export function loadAllConnectors(connectorsRoot?: string): ConnectorDefinition[] {
  const root = resolveConnectorsRoot(connectorsRoot);
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e: fs.Dirent) => e.isDirectory())
    .map((e: fs.Dirent) => {
      try {
        return loadConnectorFromDirectory(path.join(root, e.name));
      } catch {
        return null;
      }
    })
    .filter((c: ConnectorDefinition | null): c is ConnectorDefinition => c !== null);
}

export function filterConnectorsForProviders(
  connectors: ConnectorDefinition[],
  readyProviderIds: string[]
): ConnectorDefinition[] {
  const ready = new Set(readyProviderIds);
  return connectors.filter((connector) => {
    if (connector.manifest.alwaysInclude) return true;
    return connector.manifest.providerIds.some((id) => ready.has(id));
  });
}

export function buildConnectorCatalog(connectorsRoot?: string): ConnectorCatalogEntry[] {
  return loadAllConnectors(connectorsRoot).map((c) => ({
    id: c.manifest.id,
    name: c.manifest.name,
    version: c.manifest.version,
    providerIds: c.manifest.providerIds,
    domains: c.manifest.domains,
    capabilities: c.manifest.capabilities,
    description: c.manifest.description,
    playbookMd: c.playbookMd,
    alwaysInclude: c.manifest.alwaysInclude,
  }));
}

export function formatConnectorsForPlanner(
  readyProviderIds: string[],
  connectorsRoot?: string,
  maxChars = 24_000
): string {
  const connectors = filterConnectorsForProviders(
    loadAllConnectors(connectorsRoot),
    readyProviderIds
  );
  if (connectors.length === 0) return '';

  const parts: string[] = ['Connector playbooks (connected apps only):'];
  let total = parts[0]!.length;

  for (const connector of connectors) {
    const block = `\n# Connector: ${connector.manifest.name}\n\n${connector.playbookMd}\n`;
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }

  return parts.length > 1 ? parts.join('\n') : '';
}
