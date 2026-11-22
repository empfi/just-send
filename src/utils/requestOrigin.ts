import type { Request } from 'express';
import { PORT } from '../config';
import { getPrimaryLanIp } from '../services/networkService';

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isLoopbackHost(host: string): boolean {
  const hostname = (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0]).toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
}

export function getRequestOrigin(req: Request): string {
  const host = firstHeaderValue(req.headers['x-forwarded-host']) ?? req.get('host');
  if (host && !isLoopbackHost(host)) {
    const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);
    const proto = forwardedProto?.split(',')[0].trim() || req.protocol || 'http';
    return `${proto}://${host}`;
  }

  return `http://${getPrimaryLanIp()}:${PORT}`;
}
