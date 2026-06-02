import fs from 'node:fs';
import path from 'node:path';
import type { SkillCatalogEntry, SkillDefinition, SkillManifest } from './types';

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

export function resolveSkillsRoot(explicitRoot?: string): string {
  if (explicitRoot && fs.existsSync(explicitRoot)) return explicitRoot;
  const envRoot = process.env.SKILLS_ROOT;
  if (envRoot && fs.existsSync(envRoot)) return envRoot;
  return path.join(findRepoRoot(process.cwd()), 'skills');
}

function readManifest(skillDir: string): SkillManifest {
  const manifestPath = path.join(skillDir, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SkillManifest;
  if (!raw.id || !raw.capabilities?.length) {
    throw new Error(`Invalid manifest at ${manifestPath}`);
  }
  return raw;
}

export function loadSkillFromDirectory(skillDir: string): SkillDefinition {
  const manifest = readManifest(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMd = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf8') : '';
  return {
    manifest,
    skillMd,
    directory: skillDir,
  };
}

export function loadAllSkills(skillsRoot?: string): SkillDefinition[] {
  const root = resolveSkillsRoot(skillsRoot);
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e: fs.Dirent) => e.isDirectory())
    .map((e: fs.Dirent) => {
      try {
        return loadSkillFromDirectory(path.join(root, e.name));
      } catch {
        return null;
      }
    })
    .filter((s: SkillDefinition | null): s is SkillDefinition => s !== null);
}

export function buildSkillCatalog(skillsRoot?: string): SkillCatalogEntry[] {
  return loadAllSkills(skillsRoot).map((s) => ({
    id: s.manifest.id,
    name: s.manifest.name,
    version: s.manifest.version,
    connector: s.manifest.connector,
    capabilities: s.manifest.capabilities,
    description: s.manifest.description,
    skillMd: s.skillMd,
  }));
}

export function buildPlannerSkillContext(skillsRoot?: string, maxChars = 24_000): string {
  const skills = loadAllSkills(skillsRoot);
  const parts: string[] = [];
  let total = 0;

  for (const skill of skills) {
    const block = `# Skill: ${skill.manifest.name}\n\n${skill.skillMd}\n`;
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }

  return parts.join('\n---\n\n');
}
