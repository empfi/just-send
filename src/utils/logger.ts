
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

export function printBanner(port: number, host: string): void {
  console.log('');
  console.log(`  ${colors.bold}Listening on:${colors.reset} ${colors.cyan}${host}:${port}${colors.reset}`);
  console.log(`  ${colors.bold}Local URL:${colors.reset}    ${colors.green}http://localhost:${port}${colors.reset}`);
  console.log(`  ${colors.dim}Pair a phone from Connect inside the app.${colors.reset}`);
}

export { colors };
