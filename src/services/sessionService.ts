import crypto from 'crypto';

export interface SessionRecord {
  id: string;
  workspaceId: string;
  deviceId: string;
  fingerprint: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export const SESSION_COOKIE = 'js_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

class SessionService {
  private sessions = new Map<string, SessionRecord>();

  create(workspaceId: string, deviceId: string, fingerprint: string): SessionRecord {
    const now = Date.now();
    const session: SessionRecord = {
      id: crypto.randomBytes(32).toString('hex'),
      workspaceId,
      deviceId,
      fingerprint,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): SessionRecord | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  destroy(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  destroyForDevice(workspaceId: string, deviceId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.workspaceId === workspaceId && session.deviceId === deviceId) {
        this.sessions.delete(id);
      }
    }
  }

  destroyForWorkspace(workspaceId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.workspaceId === workspaceId) this.sessions.delete(id);
    }
  }
}

export default new SessionService();
