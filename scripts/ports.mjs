#!/usr/bin/env node
/**
 * Port allocation for Tilt (tilt_config.json).
 *
 *   node scripts/ports.mjs ensure   → write tilt_config.json
 *   node scripts/ports.mjs up       → ensure, then `tilt up --port …`
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreePort, portInUse } from './lib/ports-util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tiltConfigPath = path.join(root, 'tilt_config.json');

const PORT_KEYS = {
  tilt: 'tilt-port',
  api: 'api-port',
  ai: 'ai-port',
  studio: 'studio-port',
  mobile: 'mobile-port',
  web: 'web-port',
  postgres: 'postgres-port',
  redis: 'redis-port',
  qdrant: 'qdrant-port',
};

const DEFAULTS = {
  tilt: 10350,
  api: 3000,
  ai: 8000,
  studio: 5556,
  mobile: 8081,
  web: 3002,
  postgres: 5432,
  redis: 6379,
  qdrant: 6333,
};

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function readTiltConfig() {
  if (!fs.existsSync(tiltConfigPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(tiltConfigPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeTiltConfig(config) {
  const next = `${JSON.stringify(config, null, 2)}\n`;
  if (fs.existsSync(tiltConfigPath) && fs.readFileSync(tiltConfigPath, 'utf8') === next) {
    return;
  }
  fs.writeFileSync(tiltConfigPath, next);
}

function ensure() {
  loadDotEnv();
  const offset = (hash(path.resolve(root)) % 50) * 10;
  const config = readTiltConfig();
  const existing = {};
  for (const [name, cfgKey] of Object.entries(PORT_KEYS)) {
    const raw = config[cfgKey];
    if (raw !== undefined && raw !== '') existing[name] = Number(raw);
  }

  for (const [name, cfgKey] of Object.entries(PORT_KEYS)) {
    const base = DEFAULTS[name];
    const preferred = existing[name] ?? base + offset;
    const port = portInUse(preferred) ? findFreePort(base + offset) : preferred;
    config[cfgKey] = String(port);
  }

  writeTiltConfig(config);
  return config;
}

function tiltPortFromConfig(config) {
  const raw = config[PORT_KEYS.tilt];
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error('tilt-port missing in tilt_config.json — run: node scripts/ports.mjs ensure');
  return n;
}

function up() {
  const config = ensure();
  const tiltPort = tiltPortFromConfig(config);
  const tiltfileArgs = process.argv.slice(3).filter((a) => a !== '--');
  const args = ['up', '--port', String(tiltPort)];
  if (tiltfileArgs.length) args.push('--', ...tiltfileArgs);

  console.log(`Tilt → http://localhost:${tiltPort}/`);
  const r = spawnSync('tilt', args, {
    cwd: root,
    env: { ...process.env, TILT_PORT: String(tiltPort) },
    stdio: 'inherit',
    shell: true,
  });
  process.exit(r.status ?? 1);
}

const cmd = process.argv[2] ?? 'ensure';
if (cmd === 'up') up();
else if (cmd === 'ensure') ensure();
else {
  console.error(`Unknown command: ${cmd} (use ensure | up)`);
  process.exit(1);
}
