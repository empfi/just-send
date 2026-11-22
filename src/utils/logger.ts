import { generateAsciiQr, getPrimaryLanIp } from '../services/networkService';
import { LOG_LEVELS, type LogLevel } from '../config';
import { getAdvertisedOrigin } from './requestOrigin';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

function write(
  level: LogLevel,
  stream: 'log' | 'error',
  label: string,
  color: string,
  msg: string,
  detail?: unknown
): void {
  if (!LOG_LEVELS.has(level)) return;

  const time = new Date().toLocaleTimeString();
  const sink = stream === 'error' ? console.error : console.log;
  sink(`${colors.gray}[${time}]${colors.reset} ${color}[${label}]${colors.reset} ${msg}`, detail ?? '');
}

export function info(msg: string, detail?: unknown): void {
  write('info', 'log', 'INFO', colors.cyan, msg, detail);
}

export function warn(msg: string, detail?: unknown): void {
  write('warn', 'log', 'WARN', colors.yellow, msg, detail);
}

export function error(msg: string, err?: unknown): void {
  write('error', 'error', 'ERROR', '\x1b[31m', msg, err);
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
}
