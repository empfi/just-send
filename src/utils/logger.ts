import { generateAsciiQr, getPrimaryLanIp } from '../services/networkService';
import serverLogService, { type ServerLogLevel } from '../services/serverLogService';
import { getAdvertisedOrigin } from './requestOrigin';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function detailText(detail: unknown): string | undefined {
  if (detail === undefined || detail === null || detail === '') return undefined;
  if (typeof detail === 'string') return detail;
  if (detail instanceof Error) return detail.stack ?? detail.message;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function write(level: ServerLogLevel, label: string, color: string, msg: string, detail?: unknown): void {
  const time = new Date().toLocaleTimeString();
  const stream = level === 'error' ? console.error : console.log;
  stream(
    `${colors.gray}[${time}]${colors.reset} ${color}[${label}]${colors.reset} ${msg}`,
    detail ?? ''
  );
  serverLogService.record(level, msg, detailText(detail));
}

export function info(msg: string, detail?: unknown): void {
  write('info', 'INFO', colors.cyan, msg, detail);
}

export function success(msg: string, detail?: unknown): void {
  write('success', 'SUCCESS', colors.green, msg, detail);
}

export function warn(msg: string, detail?: unknown): void {
  write('warn', 'WARN', colors.yellow, msg, detail);
}

export function error(msg: string, err?: unknown): void {
  write('error', 'ERROR', '\x1b[31m', msg, err);
}

export async function printBanner(port: number, host: string): Promise<void> {
  const origin = getAdvertisedOrigin() ?? `http://${getPrimaryLanIp()}:${port}`;

  console.log('');
  console.log(`  ${colors.bold}Listening on:${colors.reset} ${colors.cyan}${host}:${port}${colors.reset}`);
  console.log(`  ${colors.bold}Local URL:${colors.reset}    ${colors.green}http://localhost:${port}${colors.reset}`);
  console.log(`  ${colors.bold}LAN URL:${colors.reset}      ${colors.cyan}${origin}${colors.reset}`);

  console.log('\n  Scan to open the app on another device:');
  const asciiQr = await generateAsciiQr(origin);
  if (asciiQr) {
    console.log(asciiQr);
  }

  serverLogService.record(
    'success',
    `Server listening on ${host}:${port}`,
    `Local: http://localhost:${port} · LAN: ${origin}`
  );
}

export { colors };
