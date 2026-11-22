import type {
  ApiResponse,
  AuditEntry,
  Breadcrumb,
  Clip,
  DeviceInfo,
  Item,
  PairingInfo,
  SystemInfo,
  Workspace,
} from './types';
import {
  createDeviceKey,
  deleteDeviceKey,
  deviceFingerprint,
  loadDeviceKey,
  randomNonce,
  saveDeviceKey,
  signRequest,
  type DevicePrivateKey,
} from './deviceCrypto';

const DEVICES_KEY = 'just_send_devices_v2';
const ACTIVE_WS_KEY = 'just_send_active_ws';
const LEGACY_TOKENS_KEY = 'just_send_workspaces_auth';
const LEGACY_WS_KEY = 'just_send_ws_id';
const LEGACY_TOKEN_KEY = 'just_send_device_token';

interface StoredDevice {
  deviceId: string;
  name?: string;
  publicKey?: JsonWebKey;
}

export interface AuthorizationResult {
  workspace: Workspace;
  deviceId: string;
  isMaster: boolean;
}

export interface CreateWorkspaceResult extends AuthorizationResult {
  keyphrase: string;
}

export interface BootstrapResult {
  workspaceId: string | null;
  isMaster: boolean;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getDevices(): Record<string, StoredDevice> {
  return readJSON<Record<string, StoredDevice>>(DEVICES_KEY, {});
}

function setDevices(devices: Record<string, StoredDevice>): void {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

function rememberDevice(workspaceId: string, device: StoredDevice): void {
  const devices = getDevices();
  devices[workspaceId] = device;
  setDevices(devices);
}

function activeWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_WS_KEY) || localStorage.getItem(LEGACY_WS_KEY) || null;
}

function setActiveWorkspace(workspaceId: string | null): void {
  if (workspaceId) {
    localStorage.setItem(ACTIVE_WS_KEY, workspaceId);
  } else {
    localStorage.removeItem(ACTIVE_WS_KEY);
    localStorage.removeItem(LEGACY_WS_KEY);
  }
}

function knownWorkspaces(): Workspace[] {
  return Object.entries(getDevices()).map(([id, device]) => ({
    id,
    name: device.name ?? 'Workspace',
  }));
}

let sessionWorkspaceId: string | null = null;
let sessionIsMaster = false;

function jsonInit(body: unknown, method = 'POST'): RequestInit {
  return {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function signalUnauthorized(): void {
  window.dispatchEvent(new Event('just-send:unauthorized'));
}

async function request<T>(url: string, init: RequestInit = {}, allowRetry = true): Promise<ApiResponse<T>> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (res.status === 401) {
    if (allowRetry) {
      const refreshed = await ensureSession(undefined, true);
      if (refreshed) return request<T>(url, init, false);
    }
    signalUnauthorized();
  }
  return (await res.json()) as ApiResponse<T>;
}

async function ensureSession(workspaceId?: string, force = false): Promise<boolean> {
  const target = workspaceId ?? activeWorkspaceId();
  if (!target) return false;
  if (!force && sessionWorkspaceId === target) return true;

  const device = getDevices()[target];
  if (!device) return false;
  const privateKey = await loadDeviceKey(target);
  if (!privateKey) return false;

  const timestamp = String(Date.now());
  const nonce = randomNonce();
  const data = `${target}.${device.deviceId}.${timestamp}.${nonce}`;
  const signature = await signRequest(privateKey, data);

  const res = await fetch('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: target,
      deviceId: device.deviceId,
      timestamp,
      nonce,
      signature,
      fingerprint: await deviceFingerprint(),
    }),
  });

  if (!res.ok) {
    sessionWorkspaceId = null;
    return false;
  }

  const json = (await res.json()) as ApiResponse<{ isMaster?: boolean }>;
  sessionIsMaster = Boolean(json.data?.isMaster);
  sessionWorkspaceId = target;
  setActiveWorkspace(target);
  return true;
}

async function upgradeLegacyAuth(): Promise<void> {
  const legacyTokens = readJSON<Record<string, string>>(LEGACY_TOKENS_KEY, {});
  const legacyWorkspace = localStorage.getItem(LEGACY_WS_KEY);
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyWorkspace && legacyToken && !legacyTokens[legacyWorkspace]) {
    legacyTokens[legacyWorkspace] = legacyToken;
  }

  const devices = getDevices();
  for (const [workspaceId, token] of Object.entries(legacyTokens)) {
    if (!token || devices[workspaceId]) continue;
    try {
      const { privateKey, publicKeyJwk } = await createDeviceKey();
      const res = await fetch('/api/devices/upgrade', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          token,
          publicKey: publicKeyJwk,
          fingerprint: await deviceFingerprint(),
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as ApiResponse<{ workspace: Workspace; deviceId: string }>;
      if (!json.success || !json.data) continue;
      await saveDeviceKey(workspaceId, privateKey);
      rememberDevice(workspaceId, {
        deviceId: json.data.deviceId,
        name: json.data.workspace.name,
        publicKey: publicKeyJwk,
      });
      sessionWorkspaceId = workspaceId;
      if (!activeWorkspaceId()) setActiveWorkspace(workspaceId);
    } catch {
      /* a failed upgrade simply requires pairing again */
    }
  }

  localStorage.removeItem(LEGACY_TOKENS_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

async function bootstrap(): Promise<BootstrapResult> {
  await upgradeLegacyAuth();

  const sessionRes = await fetch('/api/session', { credentials: 'same-origin' });
  if (sessionRes.ok) {
    const json = (await sessionRes.json()) as ApiResponse<{ workspace: Workspace; isMaster?: boolean }>;
    const workspaceId = json.data?.workspace.id ?? null;
    sessionWorkspaceId = workspaceId;
    sessionIsMaster = Boolean(json.data?.isMaster);
    if (workspaceId) {
      setActiveWorkspace(workspaceId);
      const devices = getDevices();
      if (devices[workspaceId] && json.data?.workspace.name) {
        devices[workspaceId].name = json.data.workspace.name;
        setDevices(devices);
      }
    }
    return {
      workspaceId,
      isMaster: sessionIsMaster,
    };
  }

  const workspaceId = activeWorkspaceId();
  const authenticated = workspaceId ? await ensureSession(workspaceId, true) : false;
  return {
    workspaceId: authenticated ? workspaceId : null,
    isMaster: sessionIsMaster,
  };
}

async function registerDevice<T extends AuthorizationResult>(res: ApiResponse<T>, privateKey: DevicePrivateKey, publicKeyJwk: JsonWebKey): Promise<ApiResponse<T>> {
  if (res.success && res.data) {
    await saveDeviceKey(res.data.workspace.id, privateKey);
    rememberDevice(res.data.workspace.id, {
      deviceId: res.data.deviceId,
      name: res.data.workspace.name,
      publicKey: publicKeyJwk,
    });
    setActiveWorkspace(res.data.workspace.id);
    sessionWorkspaceId = res.data.workspace.id;
    sessionIsMaster = Boolean(res.data.isMaster);
  }
  return res;
}

export const api = {
  activeWorkspaceId,
  setActiveWorkspace,
  knownWorkspaces,
  ensureSession,
  bootstrap,
  isMaster(): boolean {
    return sessionIsMaster;
  },
  currentDeviceId(workspaceId: string): string | null {
    return getDevices()[workspaceId]?.deviceId ?? null;
  },

  previewUrl(id: string): string {
    return `/api/files/${id}/preview`;
  },

  downloadUrl(id: string): string {
    return `/api/files/${id}/download`;
  },

  async listWorkspaces(): Promise<ApiResponse<Workspace[]>> {
    return request<Workspace[]>('/api/workspaces');
  },

  async deleteWorkspace(workspaceId: string): Promise<ApiResponse<null>> {
    await ensureSession(workspaceId);
    return request<null>(`/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  },

  async forgetWorkspace(workspaceId: string): Promise<void> {
    const devices = getDevices();
    delete devices[workspaceId];
    setDevices(devices);
    if (activeWorkspaceId() === workspaceId) setActiveWorkspace(null);
    if (sessionWorkspaceId === workspaceId) {
      sessionWorkspaceId = null;
      sessionIsMaster = false;
    }
    try {
      await deleteDeviceKey(workspaceId);
    } catch {
      /* orphaned key is unusable without the deleted workspace */
    }
  },

  async createWorkspace(name: string, deviceName: string): Promise<ApiResponse<CreateWorkspaceResult>> {
    const { privateKey, publicKeyJwk } = await createDeviceKey();
    const res = await request<CreateWorkspaceResult>(
      '/api/workspaces/setup',
      jsonInit({
        name,
        deviceName,
        publicKey: publicKeyJwk,
        fingerprint: await deviceFingerprint(),
      }),
      false
    );
    return registerDevice(res, privateKey, publicKeyJwk);
  },

  async recoverWorkspace(keyphrase: string, deviceName: string): Promise<ApiResponse<AuthorizationResult>> {
    const { privateKey, publicKeyJwk } = await createDeviceKey();
    const res = await request<AuthorizationResult>(
      '/api/workspaces/recover',
      jsonInit({ keyphrase, deviceName, publicKey: publicKeyJwk, fingerprint: await deviceFingerprint() }),
      false
    );
    return registerDevice(res, privateKey, publicKeyJwk);
  },

  async authorizeWithCode(
    workspaceId: string | null,
    code: string,
    deviceName: string
  ): Promise<ApiResponse<AuthorizationResult>> {
    const { privateKey, publicKeyJwk } = await createDeviceKey();
    const res = await request<AuthorizationResult>(
      '/api/workspaces/authorize/code',
      jsonInit({
        workspaceId: workspaceId ?? undefined,
        code,
        deviceName,
        publicKey: publicKeyJwk,
        fingerprint: await deviceFingerprint(),
      }),
      false
    );
    return registerDevice(res, privateKey, publicKeyJwk);
  },

  async authorizeWithQr(
    workspaceId: string,
    pairToken: string,
    deviceName: string
  ): Promise<ApiResponse<AuthorizationResult>> {
    const { privateKey, publicKeyJwk } = await createDeviceKey();
    const res = await request<AuthorizationResult>(
      '/api/workspaces/authorize/qr',
      jsonInit({ workspaceId, pairToken, deviceName, publicKey: publicKeyJwk, fingerprint: await deviceFingerprint() }),
      false
    );
    return registerDevice(res, privateKey, publicKeyJwk);
  },

  async getPairingInfo(workspaceId: string): Promise<ApiResponse<PairingInfo>> {
    await ensureSession(workspaceId);
    return request<PairingInfo>(`/api/workspaces/${workspaceId}/pairing`);
  },

  async getWorkspaceDevices(workspaceId: string): Promise<ApiResponse<DeviceInfo[]>> {
    await ensureSession(workspaceId);
    return request<DeviceInfo[]>(`/api/workspaces/${workspaceId}/devices`);
  },

  async getAuditLog(workspaceId: string): Promise<ApiResponse<AuditEntry[]>> {
    await ensureSession(workspaceId);
    return request<AuditEntry[]>(`/api/workspaces/${workspaceId}/audit`);
  },

  async revokeDevice(workspaceId: string, deviceId: string): Promise<ApiResponse<DeviceInfo>> {
    await ensureSession(workspaceId);
    return request<DeviceInfo>(`/api/workspaces/${workspaceId}/devices/${deviceId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  },

  async getFiles(params: {
    folderId?: string | null;
    search?: string;
    sort?: string;
    order?: string;
  }): Promise<ApiResponse<Item[]> & { breadcrumbs: Breadcrumb[] }> {
    const query = new URLSearchParams();
    if (params.folderId) query.set('folderId', params.folderId);
    if (params.search) query.set('search', params.search);
    if (params.sort) query.set('sort', params.sort);
    if (params.order) query.set('order', params.order);
    const url = `/api/files${query.toString() ? `?${query}` : ''}`;
    let res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401 && (await ensureSession(undefined, true))) {
      res = await fetch(url, { credentials: 'same-origin' });
    }
    if (res.status === 401) signalUnauthorized();
    const json = (await res.json()) as ApiResponse<Item[]>;
    return { ...json, breadcrumbs: json.breadcrumbs ?? [] };
  },

  uploadFiles(
    files: File[],
    folderId: string | null,
    onProgress: (percent: number) => void
  ): Promise<ApiResponse<Item[]>> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
      if (folderId) formData.append('folderId', folderId);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload', true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText) as ApiResponse<Item[]>;
          if (xhr.status >= 200 && xhr.status < 300) resolve(json);
          else reject(new Error(json.error || `Upload failed: HTTP ${xhr.status}`));
        } catch {
          reject(new Error('Invalid server response'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  },

  async deleteFile(id: string): Promise<ApiResponse<null>> {
    return request<null>(`/api/files/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  },

  async batchDelete(ids: string[]): Promise<ApiResponse<{ deleted: string[]; failed: string[] }>> {
    return request('/api/files/batch-delete', jsonInit({ ids }));
  },

  async batchDownload(ids: string[], archiveName?: string): Promise<void> {
    const res = await fetch('/api/files/batch-download', jsonInit({ ids, archiveName }));
    if (!res.ok) throw new Error('Failed to generate archive');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = archiveName || `just-send-bundle-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async createFolder(name: string, parentFolderId: string | null): Promise<ApiResponse<Item>> {
    return request<Item>('/api/folders', jsonInit({ name, parentFolderId }));
  },

  async moveItem(itemId: string, targetFolderId: string | null): Promise<ApiResponse<Item>> {
    return request<Item>(`/api/files/${itemId}/move`, jsonInit({ targetFolderId }));
  },

  async renameFile(id: string, name: string): Promise<ApiResponse<Item>> {
    return request<Item>(`/api/files/${id}/rename`, jsonInit({ name }, 'PATCH'));
  },

  async getStats(): Promise<ApiResponse<{ totalFiles: number; totalFolders: number; totalSizeBytes: number; formattedTotalSize: string }>> {
    return request('/api/stats');
  },

  async getSystemInfo(): Promise<ApiResponse<SystemInfo>> {
    return request<SystemInfo>('/api/system/info');
  },

  async getClips(): Promise<ApiResponse<Clip[]>> {
    return request<Clip[]>('/api/clips');
  },

  async addClip(content: string, sender: string): Promise<ApiResponse<Clip>> {
    return request<Clip>('/api/clips', jsonInit({ content, sender }));
  },

  async deleteClip(id: string): Promise<ApiResponse<null>> {
    return request<null>(`/api/clips/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  },
};

export type Api = typeof api;
