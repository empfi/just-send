export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'code'
  | 'other';

export interface Workspace {
  id: string;
  name: string;
  createdAt?: string;
  deviceCount?: number;
  publicKey?: string;
}

export interface Item {
  id: string;
  workspaceId: string;
  isFolder: boolean;
  folderId: string | null;
  originalName: string;
  size: number;
  formattedSize: string;
  mimeType: string;
  category: FileCategory;
  uploadedAt: string;
  downloadCount: number;
  previewImageIds?: string[];
  folderPath?: string;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface Clip {
  id: string;
  workspaceId: string;
  content: string;
  sender: string;
  createdAt: string;
}

export interface PairingInfo {
  workspaceId: string;
  workspaceName: string;
  code: string;
  secondsRemaining: number;
  qrTargetUrl: string;
  qrCode: string | null;
}

export type DeviceAccess = 'full' | 'upload' | 'view';

export interface DeviceInfo {
  id: string;
  name: string;
  isMaster: boolean;
  access: DeviceAccess;
  authorizedAt: string;
  lastSeenAt: string;
}

export interface InstanceConfig {
  name: string;
  logoUrl: string | null;
  accentColor: string;
  allowDeleteWorkspace: boolean;
  allowLeaveWorkspace: boolean;
}

export interface AuditEntry {
  at: string;
  event: string;
  workspaceId?: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  detail?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  hasWorkspaces?: boolean;
  breadcrumbs?: Breadcrumb[];
  count?: number;
}

export type ModalKind =
  | null
  | 'create-workspace'
  | 'keyphrase'
  | 'recover'
  | 'pair'
  | 'qr-scan'
  | 'unauthorized'
  | 'preview'
  | 'devices';

export type Tab = 'files' | 'clips';

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

export interface PublicShareFile {
  id: string;
  name: string;
  size: number;
  formattedSize: string;
  mimeType: string;
  category: FileCategory;
}

export interface PublicShare {
  id: string;
  createdAt: string;
  expiresAt: string;
  allowDownload: boolean;
  downloadCount: number;
  maxDownloads: number | null;
  passwordProtected: boolean;
  files: PublicShareFile[];
}

export type ToastKind = 'success' | 'error' | 'info';
export type Notify = (message: string, kind?: ToastKind) => void;
