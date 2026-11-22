import type { Request, Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../services/sessionService';

export function setSessionCookie(req: Request, res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
