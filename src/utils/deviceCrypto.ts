import crypto from 'crypto';
import type { DevicePublicKey } from '../types';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function tokenMatchesHash(token: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function isValidPublicKey(value: unknown): value is DevicePublicKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as Record<string, unknown>;
  return (
    key.kty === 'EC' &&
    key.crv === 'P-256' &&
    typeof key.x === 'string' &&
    key.x.length > 0 &&
    key.x.length < 512 &&
    typeof key.y === 'string' &&
    key.y.length > 0 &&
    key.y.length < 512
  );
}

export function verifySignature(publicKey: DevicePublicKey, data: string, signature: string): boolean {
  try {
    const key = crypto.createPublicKey({
      key: publicKey as unknown as crypto.JsonWebKey,
      format: 'jwk',
    });
    return crypto.verify(
      'sha256',
      Buffer.from(data, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
}

export function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[a-f0-9]{32,128}$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
