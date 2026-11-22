import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '../config';
import { generateKeyphrase, generateWorkspaceKeyPair, generateRotatingCode, verifyRotatingCode } from '../utils/crypto';
import { hashToken, isValidPublicKey, tokenMatchesHash, verifySignature } from '../utils/deviceCrypto';
import sseService from './sseService';
import type {
  AuthResult,
  AuthorizationResult,
  CreateWorkspaceResult,
  DeviceInfo,
  DevicePublicKey,
  DeviceRecord,
  PublicWorkspace,
  WorkspaceRecord,
} from '../types';

const WORKSPACES_META_FILE = path.join(DATA_DIR, 'metadata', 'workspaces.json');
const WORKSPACE_DATA_ROOT = path.join(DATA_DIR, 'workspaces');
const CODE_ATTEMPTS_LIMIT = 5;
const CODE_ATTEMPTS_WINDOW_MS = 5 * 60 * 1000;

interface DeviceRegistration {
  deviceName?: string;
  publicKey?: unknown;
  fingerprint?: string;
  userAgent?: string;
}

[path.join(DATA_DIR, 'metadata'), WORKSPACE_DATA_ROOT].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

class WorkspaceService {
  private workspaces: Record<string, WorkspaceRecord>;
  private codeAttempts = new Map<string, { count: number; resetAt: number }>();
  private usedQrTokens = new Map<string, number>;

  constructor() {
    this.workspaces = this.loadWorkspaces();
    this.migrateLegacyTokens();
  }

  private loadWorkspaces(): Record<string, WorkspaceRecord> {
    try {
      if (fs.existsSync(WORKSPACES_META_FILE)) {
        return JSON.parse(fs.readFileSync(WORKSPACES_META_FILE, 'utf8')) as Record<string, WorkspaceRecord>;
      }
    } catch (err) {
      console.error('Error reading workspaces:', err);
    }
    return {};
  }

  private saveWorkspaces(): void {
    try {
      fs.writeFileSync(WORKSPACES_META_FILE, JSON.stringify(this.workspaces, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (err) {
      console.error('Error saving workspaces:', err);
    }
  }

  private migrateLegacyTokens(): void {
    let changed = false;
    for (const workspace of Object.values(this.workspaces)) {
      for (const device of workspace.devices) {
        const legacy = device as DeviceRecord & { token?: string };
        if (typeof legacy.token === 'string' && legacy.token.length > 0) {
          if (!device.tokenHash) device.tokenHash = hashToken(legacy.token);
          delete legacy.token;
          changed = true;
        }
      }
    }
    if (changed) this.saveWorkspaces();
  }

  getWorkspaceDir(workspaceId: string): string {
    const dir = path.join(WORKSPACE_DATA_ROOT, workspaceId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
    }
    return dir;
  }

  getWorkspaceUploadsDir(workspaceId: string): string {
    const dir = path.join(this.getWorkspaceDir(workspaceId), 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getWorkspaceMetaFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), 'files.json');
  }

  getWorkspaceClipsFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), 'clips.json');
  }

  private buildDevice(
    name: string,
    registration: DeviceRegistration,
    isMaster: boolean
  ): DeviceRecord {
    if (!isValidPublicKey(registration.publicKey)) {
      throw new Error('A valid device public key is required');
    }
    return {
      id: crypto.randomUUID(),
      name: name.trim(),
      publicKey: registration.publicKey,
      fingerprints: registration.fingerprint ? [registration.fingerprint] : [],
      userAgent: registration.userAgent,
      isMaster,
      authorizedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
  }

  createWorkspace({
    name,
    deviceName,
    publicKey,
    fingerprint,
    userAgent,
  }: {
    name?: string;
    deviceName?: string;
  } & DeviceRegistration): CreateWorkspaceResult {
    if (!name || !name.trim()) throw new Error('Workspace name is required');
    if (!deviceName || !deviceName.trim()) throw new Error('Device name is required');

    const workspaceId = crypto.randomBytes(8).toString('hex');
    const keyphrase = generateKeyphrase();
    const keyPair = generateWorkspaceKeyPair();

    const masterDevice = this.buildDevice(
      deviceName,
      { publicKey, fingerprint, userAgent },
      true
    );

    this.getWorkspaceUploadsDir(workspaceId);

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      keyphraseHash: crypto.createHash('sha256').update(keyphrase.trim().toLowerCase()).digest('hex'),
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      rotatingSecret: crypto.randomBytes(32).toString('hex'),
      devices: [masterDevice],
    };

    this.workspaces[workspaceId] = workspace;
    this.saveWorkspaces();
    sseService.broadcast('workspace:created', { id: workspaceId, name: workspace.name });

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        publicKey: workspace.publicKey,
        createdAt: workspace.createdAt,
      },
      keyphrase,
      deviceId: masterDevice.id,
      isMaster: masterDevice.isMaster,
    };
  }

  listWorkspaces(): PublicWorkspace[] {
    return Object.values(this.workspaces).map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      deviceCount: w.devices.filter((device) => !device.revokedAt).length,
    }));
  }

  hasAnyWorkspaces(): boolean {
    return Object.keys(this.workspaces).length > 0;
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    return this.workspaces[workspaceId] || null;
  }

  getDevice(workspaceId: string, deviceId: string): DeviceRecord | null {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    return workspace.devices.find((device) => device.id === deviceId) ?? null;
  }

  authenticateDeviceById(workspaceId: string, deviceId: string): AuthResult | null {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    const device = workspace.devices.find((candidate) => candidate.id === deviceId);
    if (!device || device.revokedAt) return null;

    const now = Date.now();
    const lastSeen = Date.parse(device.lastSeenAt) || 0;
    if (now - lastSeen > 60_000) {
      device.lastSeenAt = new Date(now).toISOString();
      this.saveWorkspaces();
    }
    return { workspace, device };
  }

  upgradeDeviceKey({
    workspaceId,
    token,
    publicKey,
    fingerprint,
    userAgent,
  }: {
    workspaceId?: string;
    token?: string;
  } & DeviceRegistration): AuthResult {
    if (!workspaceId || !token) throw new Error('Missing workspace credentials');
    if (!isValidPublicKey(publicKey)) throw new Error('A valid device public key is required');

    const workspace = this.workspaces[workspaceId];
    if (!workspace) throw new Error('Workspace not found');

    const device = workspace.devices.find(
      (candidate) => !candidate.revokedAt && tokenMatchesHash(token, candidate.tokenHash)
    );
    if (!device) throw new Error('Invalid device credential');

    device.publicKey = publicKey;
    device.fingerprints = fingerprint ? [fingerprint] : device.fingerprints ?? [];
    device.userAgent = userAgent;
    delete device.tokenHash;
    device.lastSeenAt = new Date().toISOString();
    this.saveWorkspaces();

    return { workspace, device };
  }

  verifySignatureRequest({
    workspaceId,
    deviceId,
    data,
    signature,
  }: {
    workspaceId?: string;
    deviceId?: string;
    data?: string;
    signature?: string;
  }): AuthResult | null {
    if (!workspaceId || !deviceId || !data || !signature) return null;
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    const device = workspace.devices.find((candidate) => candidate.id === deviceId);
    if (!device || device.revokedAt || !device.publicKey) return null;
    if (!verifySignature(device.publicKey, data, signature)) return null;

    device.lastSeenAt = new Date().toISOString();
    this.saveWorkspaces();
    return { workspace, device };
  }

  getPairingCode(workspaceId: string): { code: string; secondsRemaining: number } | null {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    const code = generateRotatingCode(workspace.rotatingSecret, 30);
    const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    return { code, secondsRemaining };
  }

  private assertCodeAttempts(workspaceId: string): void {
    const record = this.codeAttempts.get(workspaceId);
    if (record && record.resetAt > Date.now() && record.count >= CODE_ATTEMPTS_LIMIT) {
      throw new Error('Too many failed attempts. Wait a few minutes and try again.');
    }
  }

  private recordCodeFailure(workspaceId: string): void {
    const now = Date.now();
    const record = this.codeAttempts.get(workspaceId);
    if (!record || record.resetAt <= now) {
      this.codeAttempts.set(workspaceId, { count: 1, resetAt: now + CODE_ATTEMPTS_WINDOW_MS });
      return;
    }
    record.count += 1;
  }

  private addDevice(
    workspace: WorkspaceRecord,
    registration: DeviceRegistration,
    fallbackName: string,
    isMaster: boolean
  ): DeviceRecord {
    const device = this.buildDevice(registration.deviceName || fallbackName, registration, isMaster);
    workspace.devices.push(device);
    workspace.rotatingSecret = crypto.randomBytes(32).toString('hex');
    this.saveWorkspaces();
    sseService.broadcast('workspace:device_added', {
      workspaceId: workspace.id,
      deviceName: device.name,
    });
    return device;
  }

  authorizeWithCode({
    workspaceId,
    code,
    deviceName,
    publicKey,
    fingerprint,
    userAgent,
  }: {
    workspaceId?: string;
    code?: string;
  } & DeviceRegistration): AuthorizationResult {
    if (!code || !code.trim()) throw new Error('Please enter a 6-digit code');
    if (!isValidPublicKey(publicKey)) throw new Error('A valid device public key is required');

    const cleanCode = code.trim().replace(/\s+/g, '');
    const attemptsKey = workspaceId ?? 'any';
    this.assertCodeAttempts(attemptsKey);

    let workspace: WorkspaceRecord | null = null;
    if (workspaceId) {
      workspace = this.workspaces[workspaceId];
      if (!workspace) throw new Error('Workspace not found');
      if (!verifyRotatingCode(cleanCode, workspace.rotatingSecret, 30)) {
        this.recordCodeFailure(attemptsKey);
        throw new Error('Invalid or expired 6-digit code');
      }
    } else {
      for (const candidate of Object.values(this.workspaces)) {
        if (verifyRotatingCode(cleanCode, candidate.rotatingSecret, 30)) {
          workspace = candidate;
          break;
        }
      }
      if (!workspace) {
        this.recordCodeFailure(attemptsKey);
        throw new Error('Invalid or expired 6-digit code');
      }
    }

    this.codeAttempts.delete(attemptsKey);
    const device = this.addDevice(
      workspace,
      { deviceName, publicKey, fingerprint, userAgent },
      'New Device',
      false
    );

    return {
      workspace: { id: workspace.id, name: workspace.name, publicKey: workspace.publicKey },
      deviceId: device.id,
      isMaster: device.isMaster,
    };
  }

  generatePairingToken(workspaceId: string): string | null {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    return crypto
      .createHmac('sha256', workspace.rotatingSecret)
      .update(`${workspaceId}:${Math.floor(Date.now() / 60000)}`)
      .digest('hex');
  }

  private isQrTokenValid(workspaceId: string, pairToken: string): boolean {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return false;

    const current = Math.floor(Date.now() / 60000);
    const valid = [0, 1].map((offset) =>
      crypto
        .createHmac('sha256', workspace.rotatingSecret)
        .update(`${workspaceId}:${current - offset}`)
        .digest('hex')
    );
    return valid.includes(pairToken);
  }

  authorizeWithQr({
    workspaceId,
    pairToken,
    deviceName,
    publicKey,
    fingerprint,
    userAgent,
  }: {
    workspaceId?: string;
    pairToken?: string;
  } & DeviceRegistration): AuthorizationResult {
    if (!workspaceId || !pairToken) throw new Error('Workspace not found');
    const workspace = this.workspaces[workspaceId];
    if (!workspace) throw new Error('Workspace not found');
    if (!isValidPublicKey(publicKey)) throw new Error('A valid device public key is required');

    const usedKey = `${workspaceId}:${pairToken}`;
    if (this.usedQrTokens.has(usedKey)) {
      throw new Error('This QR code has already been used. Scan a fresh one.');
    }
    if (!this.isQrTokenValid(workspaceId, pairToken)) {
      throw new Error('QR scan token has expired. Please re-scan.');
    }

    this.usedQrTokens.set(usedKey, Date.now());
    for (const [key, usedAt] of this.usedQrTokens) {
      if (Date.now() - usedAt > 5 * 60 * 1000) this.usedQrTokens.delete(key);
    }

    const device = this.addDevice(
      workspace,
      { deviceName, publicKey, fingerprint, userAgent },
      'Mobile Device',
      false
    );

    return {
      workspace: { id: workspace.id, name: workspace.name, publicKey: workspace.publicKey },
      deviceId: device.id,
      isMaster: device.isMaster,
    };
  }

  recoverWithKeyphrase({
    keyphrase,
    deviceName,
    publicKey,
    fingerprint,
    userAgent,
  }: {
    keyphrase?: string;
  } & DeviceRegistration): AuthorizationResult {
    const norm = (keyphrase || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = crypto.createHash('sha256').update(norm).digest('hex');

    const workspace = Object.values(this.workspaces).find((candidate) => candidate.keyphraseHash === hash);
    if (!workspace) throw new Error('Invalid 12-word recovery phrase');
    if (!isValidPublicKey(publicKey)) throw new Error('A valid device public key is required');

    const device = this.addDevice(
      workspace,
      { deviceName, publicKey, fingerprint, userAgent },
      'Recovered Device',
      true
    );

    return {
      workspace: { id: workspace.id, name: workspace.name, publicKey: workspace.publicKey },
      deviceId: device.id,
      isMaster: device.isMaster,
    };
  }

  revokeDevice(workspaceId: string, deviceId: string): DeviceInfo | null {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return null;
    const device = workspace.devices.find((candidate) => candidate.id === deviceId);
    if (!device || device.revokedAt) return null;

    device.revokedAt = new Date().toISOString();
    delete device.tokenHash;
    this.saveWorkspaces();
    return { id: device.id, name: device.name, isMaster: device.isMaster, authorizedAt: device.authorizedAt, lastSeenAt: device.lastSeenAt };
  }

  getDevices(workspaceId: string): DeviceInfo[] {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) return [];
    return workspace.devices
      .filter((device) => !device.revokedAt)
      .map((device) => ({
        id: device.id,
        name: device.name,
        isMaster: device.isMaster,
        authorizedAt: device.authorizedAt,
        lastSeenAt: device.lastSeenAt,
      }));
  }
}

export type { DevicePublicKey };
export default new WorkspaceService();
