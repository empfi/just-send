import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';

const AUDIT_DIR = path.join(DATA_DIR, 'metadata');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.log');
const MAX_AUDIT_BYTES = 5 * 1024 * 1024;

export interface AuditMeta {
  workspaceId?: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  detail?: string;
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(AUDIT_FILE);
    if (stat.size > MAX_AUDIT_BYTES) {
      fs.renameSync(AUDIT_FILE, `${AUDIT_FILE}.1`);
    }
  } catch {
    /* file does not exist yet */
  }
}

class AuditService {
  log(event: string, meta: AuditMeta = {}): void {
    try {
      if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
      rotateIfNeeded();
      const line = JSON.stringify({
        at: new Date().toISOString(),
        event,
        ...meta,
      });
      fs.appendFileSync(AUDIT_FILE, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.error('Audit log write failed:', err);
    }
  }

  readRecent(workspaceId: string, limit = 100): string[] {
    try {
      if (!fs.existsSync(AUDIT_FILE)) return [];
      const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n');
      const matching: string[] = [];
      for (let index = lines.length - 1; index >= 0 && matching.length < limit; index -= 1) {
        try {
          const parsed = JSON.parse(lines[index]) as { workspaceId?: string };
          if (parsed.workspaceId === workspaceId) matching.push(lines[index]);
        } catch {
          /* skip corrupt line */
        }
      }
      return matching;
    } catch {
      return [];
    }
  }
}

export default new AuditService();
