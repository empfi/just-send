import type { NextFunction, Request, Response } from 'express';
import sessionService, { SESSION_COOKIE, type SessionRecord } from '../services/sessionService';
import workspaceService from '../services/workspaceService';
import type { AuthResult } from '../types';

export interface SessionAuth extends AuthResult {
  session: SessionRecord;
}

export interface AuthedRequest extends Request {
  auth?: SessionAuth;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function sessionAuthFromRequest(req: Request): SessionAuth | null {
  const cookies = parseCookies(req.headers.cookie);
  const session = sessionService.get(cookies[SESSION_COOKIE]);
  if (!session) return null;

  const auth = workspaceService.authenticateDeviceById(session.workspaceId, session.deviceId);
  if (!auth) {
    sessionService.destroy(session.id);
    return null;
  }
  return { ...auth, session };
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const auth = sessionAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
}

export function authed(req: Request): SessionAuth {
  const auth = (req as AuthedRequest).auth;
  if (!auth) throw new Error('Unauthorized request');
  return auth;
}
