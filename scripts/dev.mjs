
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PORT_ENV = {
  api: 'API_PORT',
  gateway: 'API_PORT',
  ai: 'AI_PORT',
  'ai-runtime': 'AI_PORT',
  'tool-runtime': 'TOOL_RUNTIME_PORT',
  'skill-runtime': 'SKILL_RUNTIME_PORT',
  'ai-orchestrator': 'AI_ORCHESTRATOR_PORT',
  'cognitive-runtime': 'AI_ORCHESTRATOR_PORT',
  'ingestion-engine': 'INGESTION_ENGINE_PORT',
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

function findPython(aiDirName = 'ai-runtime') {
  const aiDir = path.join(root, 'services', aiDirName);
  const win = path.join(aiDir, 'venv', 'Scripts', 'python.exe');
  const unix = path.join(aiDir, 'venv', 'bin', 'python');
  if (process.platform === 'win32' && fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function serveAi() {
  const port = portFor('ai-runtime');
  const aiDir = path.join(root, 'services', 'ai-runtime');
  const python = findPython('ai-runtime');
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

async function dbSetup() {
  console.log('[db-setup] Generating Prisma client from schema...');
  process.env.PRISMA_GENERATE_LENIENT = '1';
  let code = await run('node', ['scripts/prisma-generate.mjs']);
  if (code !== 0) process.exit(code);

  console.log('[db-setup] Applying migrations (migrate deploy)...');
  code = await runWithEnv([
    'pnpm',
    '--filter',
    '@ai-assistant/database',
    'run',
    'db:migrate:deploy',
  ]);
  if (code !== 0) {
    console.error('[db-setup] migrate deploy failed');
    process.exit(code);
  }

  console.log('[db-setup] Building @ai-assistant/database...');
  code = await runWithEnv(['pnpm', '--filter', '@ai-assistant/database', 'build']);
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

async function serveCognitiveRuntime() {
  const port = portFor('cognitive-runtime');
  const orchDir = path.join(root, 'services', 'cognitive-runtime');
  const python = findPython('ai-runtime');
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
    build: ['pnpm', '--filter', '@ai-assistant/gateway', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/gateway', 'run', 'serve']),
  },
  gateway: {
    build: ['pnpm', '--filter', '@ai-assistant/gateway', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/gateway', 'run', 'serve']),
  },
  'tool-runtime': {
    build: ['pnpm', '--filter', '@ai-assistant/tool-runtime', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/tool-runtime', 'start']),
  },
  'skill-runtime': {
    build: ['pnpm', '--filter', '@ai-assistant/skill-runtime', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/skill-runtime', 'start']),
  },
  ai: { serve: serveAi },
  'ai-runtime': { serve: serveAi },
  'ai-orchestrator': { serve: serveCognitiveRuntime },
  'cognitive-runtime': { serve: serveCognitiveRuntime },
  'ingestion-engine': {
    build: ['pnpm', '--filter', '@ai-assistant/ingestion-engine', 'build'],
    serve: () => runWithEnv(['pnpm', '--filter', '@ai-assistant/ingestion-engine', 'start']),
  },
  studio: { serve: serveStudio },
  mobile: { serve: serveMobile },
};

async function main() {
  await loadEnv();

  const [action, name] = process.argv.slice(2);

  if (action === 'db-setup') {
    await dbSetup();
    return;
  }

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
    'Usage: node scripts/dev.mjs <build|serve> <gateway|api|tool-runtime|skill-runtime|ai|ai-runtime|cognitive-runtime|studio|mobile>'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
