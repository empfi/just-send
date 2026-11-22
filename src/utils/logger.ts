import { generateAsciiQr } from '../services/networkService';
import type { NetworkAddress } from '../services/networkService';
import { PUBLIC_URL } from '../config';

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

export function info(msg: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.cyan}[INFO]${colors.reset} ${msg}`);
}

export function success(msg: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${msg}`);
}

export function warn(msg: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

export function error(msg: string, err?: unknown): void {
  const time = new Date().toLocaleTimeString();
  console.error(`${colors.gray}[${time}]${colors.reset} \x1b[31m[ERROR]\x1b[0m ${msg}`, err ?? '');
}

export async function printBanner(port: number, addresses: NetworkAddress[], primaryIp: string): Promise<void> {
  const localUrl = `http://localhost:${port}`;
  const networkUrl = PUBLIC_URL ?? `http://${primaryIp}:${port}`;

  console.log('');
  if (PUBLIC_URL) {
    console.log(`  ${colors.bold}Public URL:${colors.reset} ${colors.cyan}${colors.bold}${networkUrl}${colors.reset}`);
  } else {
    console.log(`  ${colors.bold}Access on this PC:${colors.reset}   ${colors.green}${localUrl}${colors.reset}`);
    console.log(`  ${colors.bold}Access on Phone/LAN:${colors.reset} ${colors.cyan}${colors.bold}${networkUrl}${colors.reset}`);
  }

  if (!PUBLIC_URL && addresses.length > 1) {
    console.log(`\n  ${colors.dim}Other Available Network Interfaces:${colors.reset}`);
    addresses.forEach((a) => {
      console.log(`    - ${a.interface}: ${colors.cyan}http://${a.address}:${port}${colors.reset}`);
    });
  }

  console.log('\n  Scan with your phone camera to connect:');
  const asciiQr = await generateAsciiQr(networkUrl);
  if (asciiQr) {
    console.log(asciiQr);
  }
}

export { colors };
