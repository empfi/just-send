import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '../config';

export const MAX_SHARE_HOURS = 7 * 24;
const METADATA_DIR = path.join(DATA_DIR, 'metadata');
const SHARES_FILE = path.join(METADATA_DIR, 'shares.json');

export interface SharedFileEntry {
  itemId: string;
  displayPath: string;
}

export interface ShareRecord {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  passwordHash: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  allowDownload: boolean;
  unlockSecret: string;
  files: SharedFileEntry[];
}

export interface ShareSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  fileCount: number;
  files: string[];
  passwordProtected: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  allowDownload: boolean;
}

export interface CreateShareInput {
  workspaceId: string;
  createdBy: string;
  files: SharedFileEntry[];
  hours: number;
  password?: string | null;
  maxDownloads?: number | null;
  allowDownload?: boolean;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

class ShareService {
  private shares: Record<string, ShareRecord> = {};

  constructor() {
    this.reload();
  }

  private reload(): void {
    try {
      if (fs.existsSync(SHARES_FILE)) {
        this.shares = JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8')) as Record<string, ShareRecord>;
      }
    } catch (err) {
      console.error('Error reading shares:', err);
      this.shares = {};
    }
    this.pruneExpired();
  }

  private save(): void {
    try {
      fs.mkdirSync(METADATA_DIR, { recursive: true });
      fs.writeFileSync(SHARES_FILE, JSON.stringify(this.shares), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.error('Error saving shares:', err);
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, share] of Object.entries(this.shares)) {
      if (new Date(share.expiresAt).getTime() <= now) {
        delete this.shares[id];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  create(input: CreateShareInput): ShareRecord {
    this.pruneExpired();
    const hours = Math.min(MAX_SHARE_HOURS, Math.max(1, Math.round(input.hours)));
    const now = Date.now();
    const record: ShareRecord = {
      id: crypto.randomBytes(12).toString('base64url'),
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + hours * 60 * 60 * 1000).toISOString(),
      passwordHash: input.password ? hashPassword(input.password) : null,
      maxDownloads:
        typeof input.maxDownloads === 'number' && input.maxDownloads > 0
          ? Math.round(input.maxDownloads)
          : null,
      downloadCount: 0,
      allowDownload: input.allowDownload !== false,
      unlockSecret: crypto.randomBytes(32).toString('hex'),
      files: input.files,
    };
    this.shares[record.id] = record;
    this.save();
    return record;
  }

  get(id: string): ShareRecord | null {
    const share = this.shares[id];
    if (!share) return null;
    if (new Date(share.expiresAt).getTime() <= Date.now()) {
      delete this.shares[id];
      this.save();
      return null;
    }
    return share;
  }

  listForWorkspace(workspaceId: string): ShareRecord[] {
    this.pruneExpired();
    return Object.values(this.shares)
      .filter((share) => share.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  revoke(workspaceId: string, id: string): boolean {
    const share = this.shares[id];
    if (!share || share.workspaceId !== workspaceId) return false;
    delete this.shares[id];
    this.save();
    return true;
  }

  verifyPassword(share: ShareRecord, password: string): boolean {
    if (!share.passwordHash) return true;
    const [scheme, salt, digest] = share.passwordHash.split('$');
    if (scheme !== 'scrypt' || !salt || !digest) return false;
    const candidate = crypto.scryptSync(password, salt, 32);
    const expected = Buffer.from(digest, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  unlockToken(share: ShareRecord): string {
    return crypto.createHmac('sha256', share.unlockSecret).update(share.id).digest('base64url');
  }

  // Returns false when the download cap is already reached.
  registerDownload(share: ShareRecord): boolean {
    if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) return false;
    share.downloadCount += 1;
    this.save();
    return true;
  }

  toSummary(share: ShareRecord): ShareSummary {
    return {
      id: share.id,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      fileCount: share.files.length,
      files: share.files.slice(0, 8).map((file) => file.displayPath),
      passwordProtected: Boolean(share.passwordHash),
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      allowDownload: share.allowDownload,
    };
  }
}

export default new ShareService();
