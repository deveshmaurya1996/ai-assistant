
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PORT_ENV = {
  api: 'API_PORT',
  ai: 'AI_PORT',
  'tool-runtime': 'TOOL_RUNTIME_PORT',
  'ai-orchestrator': 'AI_ORCHESTRATOR_PORT',
  studio: 'PRISMA_STUDIO_PORT',
  mobile: 'EXPO_DEV_PORT',
};

async function loadEnv() {
  const { config } = await import('dotenv');
  config({ path: path.join(root, '.env'), quiet: true });
  try {
    createRequire(import.meta.url)(path.join(root, 'packages', 'config', 'dist', 'register.js'));
  } catch {
    /* Tilt passes port env directly; optional register before build */
  }
}

function portFor(name) {
  const key = PORT_ENV[name];
  const n = Number(process.env[key]);
  if (!key || !Number.isFinite(n)) {
    throw new Error(`Missing ${key} in environment (start via tilt up)`);
  }
  return n;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
      ...opts,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
}

function runWithEnv(args) {
  return run('node', ['scripts/with-env.mjs', ...args]);
}

function findPython() {
  const aiDir = path.join(root, 'services', 'ai');
  const win = path.join(aiDir, 'venv', 'Scripts', 'python.exe');
  const unix = path.join(aiDir, 'venv', 'bin', 'python');
  if (process.platform === 'win32' && fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function serveAi() {
  const port = portFor('ai');
  const aiDir = path.join(root, 'services', 'ai');
  const python = findPython();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ['-m', 'uvicorn', 'main:app', '--reload', '--host', '0.0.0.0', '--port', String(port)],
      { cwd: aiDir, stdio: 'inherit', env: process.env },
    );
    child.on('error', reject);
    child.on('exit', (c) => resolve(c ?? 1));
  });
  process.exit(code);
}

async function serveStudio() {
  const port = portFor('studio');
  process.exit(
    await runWithEnv([
      'pnpm',
      '--filter',
      '@ai-assistant/database',
      'exec',
      'prisma',
      'studio',
      '--port',
      String(port),
      '--browser',
      'none',
      '--hostname',
      '127.0.0.1',
    ]),
  );
}

async function serveMobile() {
  const port = portFor('mobile');
  process.env.EXPO_DEV_PORT = String(port);
  process.env.CI = '1';
  process.env.EXPO_NO_TYPESCRIPT_SETUP = '1';

  console.log(`Expo web → http://localhost:${port}`);

  process.exit(
    await runWithEnv([
      'pnpm',
      '--filter',
      '@ai-assistant/mobile',
      'exec',
      'expo',
      'start',
      '--web',
      '--port',
      String(port),
      '--host',
      'localhost',
    ]),
  );
}

async function serveAiOrchestrator() {
  const port = portFor('ai-orchestrator');
  const orchDir = path.join(root, 'services', 'ai-orchestrator');
  const python = findPython();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ['-m', 'uvicorn', 'main:app', '--reload', '--host', '0.0.0.0', '--port', String(port)],
      { cwd: orchDir, stdio: 'inherit', env: process.env },
    );
    child.on('error', reject);
    child.on('exit', (c) => resolve(c ?? 1));
  });
  process.exit(code);
}

const HANDLERS = {
  api: {
    build: ['pnpm', '--filter', '@ai-assistant/api', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/api', 'run', 'serve']),
  },
  'tool-runtime': {
    build: ['pnpm', '--filter', '@ai-assistant/tool-runtime', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/tool-runtime', 'start']),
  },
  ai: { serve: serveAi },
  'ai-orchestrator': { serve: serveAiOrchestrator },
  studio: { serve: serveStudio },
  mobile: { serve: serveMobile },
};

async function main() {
  await loadEnv();

  const [action, name] = process.argv.slice(2);
  const handler = HANDLERS[name];

  if (!handler) {
    console.error(`Unknown service "${name}". Use: ${Object.keys(HANDLERS).join(', ')}`);
    process.exit(1);
  }

  if (action === 'build') {
    if (!handler.build) {
      console.error(`Service "${name}" has no build step`);
      process.exit(1);
    }
    process.exit(await runWithEnv(handler.build));
  }

  if (action === 'serve') {
    const result = handler.serve();
    if (result instanceof Promise) await result;
    return;
  }

  console.error(
    'Usage: node scripts/dev.mjs <build|serve> <api|tool-runtime|ai|ai-orchestrator|studio|mobile>'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
