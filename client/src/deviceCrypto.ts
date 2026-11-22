import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

const DB_NAME = 'just-send-keys';
const STORE_NAME = 'device-keys';
const FINGERPRINT_PREFIX = 'just-send-device-v1';

export type DevicePrivateKey = CryptoKey | Uint8Array;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDeviceKey(workspaceId: string, key: DevicePrivateKey): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, workspaceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDeviceKey(workspaceId: string): Promise<DevicePrivateKey | null> {
  const db = await openDatabase();
  const key = await new Promise<DevicePrivateKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(workspaceId);
    request.onsuccess = () => resolve((request.result as DevicePrivateKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return key;
}

export async function deleteDeviceKey(workspaceId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(workspaceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createDeviceKey(): Promise<{ privateKey: Uint8Array; publicKeyJwk: JsonWebKey }> {
  const { secretKey } = p256.keygen();
  const publicKey = p256.getPublicKey(secretKey, false);
  return {
    privateKey: secretKey,
    publicKeyJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicKey.slice(1, 33)),
      y: toBase64Url(publicKey.slice(33)),
    },
  };
}

export async function signRequest(privateKey: DevicePrivateKey, data: string): Promise<string> {
  if (privateKey instanceof Uint8Array) {
    const signature = p256.sign(new TextEncoder().encode(data), privateKey, {
      prehash: true,
      lowS: true,
    });
    return toBase64Url(signature);
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error('This saved device key cannot be used on this connection. Pair this device again.');
  }

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(data)
  );
  return toBase64Url(new Uint8Array(signature));
}

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

let cachedFingerprint: string | null = null;

export async function deviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const signals = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    (navigator.languages ?? []).join(','),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${navigator.hardwareConcurrency ?? ''}`,
    `${nav.deviceMemory ?? ''}`,
  ].join('|');

  const digest = sha256(new TextEncoder().encode(`${FINGERPRINT_PREFIX}:${signals}`));
  cachedFingerprint = Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return cachedFingerprint;
}
