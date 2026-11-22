export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'code'
  | 'other';

export interface DevicePublicKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash?: string;
  publicKey?: DevicePublicKey;
  fingerprints?: string[];
  userAgent?: string;
  isMaster: boolean;
  authorizedAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: string;
  keyphraseHash: string;
  publicKey: string;
  privateKey: string;
  rotatingSecret: string;
  devices: DeviceRecord[];
}

export interface PublicWorkspace {
  id: string;
  name: string;
  publicKey?: string;
  createdAt?: string;
  deviceCount?: number;
}

export interface StoredItem {
  id: string;
  workspaceId: string;
  isFolder: boolean;
  folderId: string | null;
  originalName: string;
  storedName: string | null;
  size: number;
  formattedSize?: string;
  mimeType: string;
  category: FileCategory;
  uploadedAt: string;
  downloadCount: number;
  uploaderDeviceId?: string | null;
  previewImageIds?: string[];
}

export interface ClipRecord {
  id: string;
  workspaceId: string;
  content: string;
  sender: string;
  createdAt: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  isMaster: boolean;
  authorizedAt: string;
  lastSeenAt: string;
}

export interface AuthResult {
  workspace: WorkspaceRecord;
  device: DeviceRecord;
}

export interface AuthorizationResult {
  workspace: PublicWorkspace;
  deviceId: string;
  isMaster: boolean;
}

export interface CreateWorkspaceResult extends AuthorizationResult {
  keyphrase: string;
}

export interface AppError extends Error {
  status?: number;
}
