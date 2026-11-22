import type { Request } from 'express';
import { PORT } from '../config';
import { getPrimaryLanIp } from '../services/networkService';

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const LOOPBACK_ADDRESSES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isLoopbackHost(host: string): boolean {
  const hostname = (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0]).toLowerCase();
  return LOOPBACK_ADDRESSES.has(hostname);
}

export function getAdvertisedOrigin(): string | null {
  const explicit = process.env.PUBLIC_URL?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // Fall through to host-provided addresses.
    }
  }

  const serverIp = process.env.SERVER_IP?.trim().replace(/^\[|\]$/g, '');
  if (!serverIp || LOOPBACK_ADDRESSES.has(serverIp)) return null;
  const serverPort = process.env.SERVER_PORT?.trim() || String(PORT);
  return `http://${serverIp.includes(':') ? `[${serverIp}]` : serverIp}:${serverPort}`;
}

export function getRequestOrigin(req: Request): string {
  const host = firstHeaderValue(req.headers['x-forwarded-host']) ?? req.get('host');
  if (host && !isLoopbackHost(host)) {
    const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);
    const proto = forwardedProto?.split(',')[0].trim() || req.protocol || 'http';
    return `${proto}://${host}`;
  }

  return getAdvertisedOrigin() ?? `http://${getPrimaryLanIp()}:${PORT}`;
}
