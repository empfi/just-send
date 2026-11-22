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

export function deriveKeyFromPhrase(phrase: string, salt = 'just-send-workspace-salt'): Buffer {
  const normPhrase = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.pbkdf2Sync(normPhrase, salt, 100000, 32, 'sha256');
}

export function generateWorkspaceKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

export function encryptData(textOrBuffer: string | Buffer, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const dataBuf = Buffer.isBuffer(textOrBuffer) ? textOrBuffer : Buffer.from(textOrBuffer, 'utf8');
  const encrypted = Buffer.concat([cipher.update(dataBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptData(encryptedObj: EncryptedPayload, key: Buffer): Buffer {
  const iv = Buffer.from(encryptedObj.iv, 'base64');
  const tag = Buffer.from(encryptedObj.tag, 'base64');
  const data = Buffer.from(encryptedObj.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
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
