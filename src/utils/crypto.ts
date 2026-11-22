import crypto from 'crypto';
import WORDLIST from './wordlist';

export function generateKeyphrase(): string {
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const randIndex = crypto.randomInt(0, WORDLIST.length);
    words.push(WORDLIST[randIndex]);
  }
  return words.join(' ');
}

export function generateWorkspaceKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function truncateStep(secret: string, step: number): string {
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(step), 0);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timeBuf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

export function generateRotatingCode(secret: string, stepSeconds = 30): string {
  const timeStep = Math.floor(Date.now() / 1000 / stepSeconds);
  return truncateStep(secret, timeStep);
}

export function verifyRotatingCode(inputCode: string, secret: string, stepSeconds = 30): boolean {
  const clean = (inputCode || '').trim().replace(/\s+/g, '');
  const currentStep = Math.floor(Date.now() / 1000 / stepSeconds);

  for (const step of [currentStep, currentStep - 1, currentStep + 1]) {
    if (truncateStep(secret, step) === clean) return true;
  }
  return false;
}
