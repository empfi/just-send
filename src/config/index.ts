import path from 'path';
import fs from 'fs';

const ROOT_DIR = path.resolve(process.cwd());

// Load .env when present. Variables already set by the host win.
function loadEnvFile(): void {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (quoted) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnvFile();

const PORT = parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '', 10) || 3456;
const HOST = process.env.HOST || '0.0.0.0';

const DATA_DIR = path.join(ROOT_DIR, 'data');
const METADATA_DIR = process.env.METADATA_DIR
  ? path.resolve(process.env.METADATA_DIR)
  : path.join(DATA_DIR, 'metadata');

const CLIENT_DIR = path.join(ROOT_DIR, 'dist', 'client');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES ?? '', 10) || 50 * 1024 * 1024 * 1024;

const LOG_LEVEL = ['info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVEL)[number];

function parseLogLevels(raw: string | undefined): Set<LogLevel> {
  const requested = (raw ?? 'error')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  return new Set(
    requested.filter((value): value is LogLevel => (LOG_LEVEL as readonly string[]).includes(value))
  );
}

// Only errors are logged unless LOG_LEVELS asks for more.
const LOG_LEVELS = parseLogLevels(process.env.LOG_LEVELS);

[DATA_DIR, METADATA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export { PORT, HOST, ROOT_DIR, DATA_DIR, METADATA_DIR, CLIENT_DIR, MAX_FILE_SIZE, LOG_LEVELS };
