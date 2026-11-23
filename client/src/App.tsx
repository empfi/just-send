import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import { api, type AuthorizationResult, type CreateWorkspaceResult } from './api';
import type { Breadcrumb, Clip, InstanceConfig, Item, ModalKind, Tab, ToastKind, Workspace } from './types';
import { copyText, defaultDeviceName } from './utils';
import { Icon } from './components/Icon';
import { IconSprite } from './components/IconSprite';
import { Header } from './components/Header';
import { MobileDock } from './components/MobileDock';
import { FilesView, type ViewMode } from './components/FilesView';
import { ClipsView } from './components/ClipsView';
import { UploadDock, type UploadProgress } from './components/UploadDock';
import { CreateWorkspaceSheet } from './components/modals/CreateWorkspaceSheet';
import { KeyphraseSheet } from './components/modals/KeyphraseSheet';
import { RecoverSheet } from './components/modals/RecoverSheet';
import { UnauthorizedSheet } from './components/modals/UnauthorizedSheet';
import { PairSheet } from './components/modals/PairSheet';
import { QrScanSheet } from './components/modals/QrScanSheet';
import { PreviewSheet } from './components/modals/PreviewSheet';
import { DevicesSheet } from './components/modals/DevicesSheet';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ContextState {
  x: number;
  y: number;
  item: Item | null;
}

const CONTEXT_WIDTH = 190;
const DEFAULT_INSTANCE: InstanceConfig = {
  name: 'Just Send',
  logoUrl: null,
  accentColor: '#3b82f6',
  allowDeleteWorkspace: true,
  allowLeaveWorkspace: true,
};

interface AppRoute {
  tab: Tab;
  folderId: string | null;
  fileId: string | null;
  pair: { workspaceId: string; token: string } | null;
}

function migrateLegacyPath(): void {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return;

  const [rawPath, rawQuery] = hash.slice(1).split('?');
  let path = rawPath;
  if (rawPath.startsWith('/files')) {
    const id = rawPath.slice('/files'.length).replace(/^\/+/, '');
    path = id ? `/folder/${id}` : '/files';
  }

  const query = rawQuery || window.location.search.replace(/^\?/, '');
  history.replaceState(null, '', `${path}${query ? `?${query}` : ''}`);
}

function readRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const workspaceId = params.get('ws');
  const token = params.get('token');
  if (workspaceId && token) {
    return { tab: 'files', folderId: null, fileId: null, pair: { workspaceId, token } };
  }

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/clips') {
    return { tab: 'clips', folderId: null, fileId: null, pair: null };
  }

  const nested = path.match(/^\/folder\/([^/]+)(?:\/([^/]+))?$/);
  if (nested) {
    return {
      tab: 'files',
      folderId: decodeURIComponent(nested[1]),
      fileId: nested[2] ? decodeURIComponent(nested[2]) : null,
      pair: null,
    };
  }

  const directFile = path.match(/^\/file\/([^/]+)$/);
  if (directFile) {
    return { tab: 'files', folderId: null, fileId: decodeURIComponent(directFile[1]), pair: null };
  }

  return { tab: 'files', folderId: null, fileId: null, pair: null };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('files');
  const [instance, setInstance] = useState<InstanceConfig>(DEFAULT_INSTANCE);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [routeFileId, setRouteFileId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipComposerOpen, setClipComposerOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const [currentWsId, setCurrentWsId] = useState<string | null>(() => api.activeWorkspaceId());
  const [isMaster, setIsMaster] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalKind>(null);
  const [keyphrase, setKeyphrase] = useState('');
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [qrScan, setQrScan] = useState<{ workspaceId: string; token: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const uploadRunId = useRef(0);
  const toastSeq = useRef(0);
  const reloadTimer = useRef<number | undefined>(undefined);
  const [reloadTick, setReloadTick] = useState(0);
  const [context, setContext] = useState<ContextState | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastSeq.current;
    // Never stack more than three, so phones keep a single readable strip.
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      kind === 'error' ? 4200 : 2600
    );
  }, []);

  const scheduleReload = useCallback(() => {
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => setReloadTick((tick) => tick + 1), 300);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthenticated(false);
      setCurrentWsId(null);
      setModal((current) =>
        current === 'qr-scan' || current === 'create-workspace' || current === 'recover'
          ? current
          : 'unauthorized'
      );
    };
    window.addEventListener('just-send:unauthorized', onUnauthorized);
    return () => window.removeEventListener('just-send:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    migrateLegacyPath();

    const applyRoute = () => {
      migrateLegacyPath();
      const route = readRoute();
      if (route.pair) {
        setQrScan(route.pair);
        setModal('qr-scan');
        return;
      }

      setTab(route.tab);
      setFolderId(route.folderId);
      setRouteFileId(route.fileId);
      setSelected(new Set());
      if (!route.fileId) setModal((current) => (current === 'preview' ? null : current));
    };

    applyRoute();
    window.addEventListener('popstate', applyRoute);
    window.addEventListener('hashchange', applyRoute);
    return () => {
      window.removeEventListener('popstate', applyRoute);
      window.removeEventListener('hashchange', applyRoute);
    };
  }, []);

  const changeTab = (next: Tab) => {
    setClipComposerOpen(false);
    setTab(next);
    const path = next === 'clips' ? '/clips' : folderId ? `/folder/${folderId}` : '/files';
    if (window.location.pathname !== path) history.pushState(null, '', path);
    setRouteFileId(null);
    setModal((current) => (current === 'preview' ? null : current));
  };

  const navigate = (id: string | null) => {
    const path = id ? `/folder/${id}` : '/files';
    setSelected(new Set());
    setItems([]);
    setFilesLoading(true);
    setRouteFileId(null);
    setModal((current) => (current === 'preview' ? null : current));
    if (window.location.pathname === path) {
      setFolderId(id);
      setReloadTick((tick) => tick + 1);
    } else {
      history.pushState(null, '', path);
      setFolderId(id);
    }
  };

  const openPreview = (item: Item) => {
    setPreviewItem(item);
    setModal('preview');
    setRouteFileId(item.id);
    const path = folderId ? `/folder/${folderId}/${item.id}` : `/file/${item.id}`;
    if (window.location.pathname !== path) history.pushState(null, '', path);
  };

  const closePreview = () => {
    setModal(null);
    setRouteFileId(null);
    const path = folderId ? `/folder/${folderId}` : '/files';
    if (window.location.pathname !== path) history.replaceState(null, '', path);
  };

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    const res = await api.listWorkspaces().catch(() => null);
    setWorkspacesLoading(false);
    if (!res || !res.success) {
      if (res?.error === 'Not authenticated') {
        setAuthenticated(false);
        setCurrentWsId(null);
        setModal((current) => (current === 'qr-scan' ? current : 'unauthorized'));
      }
      return;
    }
    const list = [...(res.data ?? [])];
    for (const known of api.knownWorkspaces()) {
      if (!list.some((workspace) => workspace.id === known.id)) list.push(known);
    }
    setWorkspaces(list);
    setHasWorkspaces(Boolean(res.hasWorkspaces));

    if (list.length > 0) {
      const stored = api.activeWorkspaceId();
      const match = list.find((w) => w.id === stored) ?? list[0];
      setCurrentWsId(match.id);
      api.setActiveWorkspace(match.id);
      setModal((current) => (current === 'unauthorized' ? null : current));
      return;
    }

    setCurrentWsId(null);
    if (!res.hasWorkspaces) {
      setModal((current) => (current === null ? 'create-workspace' : current));
    } else {
      setModal((current) => (current === null ? 'unauthorized' : current));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getInstanceConfig()
      .then((res) => {
        if (!cancelled && res.success && res.data) setInstance(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const boot = await api.bootstrap();
        setIsMaster(boot.isMaster);
        if (boot.workspaceId) {
          setAuthenticated(true);
          setCurrentWsId(boot.workspaceId);
          await loadWorkspaces();
        } else {
          setAuthenticated(false);
          setCurrentWsId(null);
          setModal((current) => (current === 'qr-scan' ? current : 'unauthorized'));
        }
      } catch {
        setAuthenticated(false);
        setCurrentWsId(null);
        setModal((current) => (current === 'qr-scan' ? current : 'unauthorized'));
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [loadWorkspaces]);

  useEffect(() => {
    const currentFolder = tab === 'files' && folderId ? breadcrumbs.find((crumb) => crumb.id === folderId) : null;
    document.title = currentFolder ? `${currentFolder.name} | ${instance.name}` : instance.name;
  }, [tab, folderId, breadcrumbs, instance.name]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', instance.accentColor);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', instance.accentColor);

    if (!instance.logoUrl) return;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = instance.logoUrl;
  }, [instance]);

  useEffect(() => {
    if (!authenticated || tab !== 'files' || !currentWsId) {
      setFilesLoading(false);
      return undefined;
    }
    let cancelled = false;
    const [field, order] = sort.split('-');
    setFilesLoading(true);
    api
      .getFiles({ folderId, search, sort: field, order })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setItems(res.data ?? []);
          setBreadcrumbs(res.breadcrumbs ?? []);
        } else if (res.error && res.error !== 'Not authenticated') {
          notify(res.error, 'error');
        }
      })
      .catch(() => {
        if (!cancelled) notify('Failed to load items', 'error');
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, tab, currentWsId, folderId, search, sort, reloadTick, notify]);

  useEffect(() => {
    if (!authenticated || !currentWsId) {
      setClipsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setClipsLoading(true);
    api
      .getClips()
      .then((res) => {
        if (!cancelled && res.success) setClips(res.data ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setClipsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, currentWsId, reloadTick]);

  useEffect(() => {
    if (!routeFileId || items.length === 0) return;
    const match = items.find((item) => item.id === routeFileId);
    if (match && !match.isFolder) {
      setPreviewItem(match);
      setModal('preview');
    }
  }, [routeFileId, items]);

  useEffect(() => {
    if (!authenticated || !currentWsId) return undefined;
    const source = new EventSource('/api/events');
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string };
        if (
          data.type === 'file:uploaded' ||
          data.type === 'item:created' ||
          data.type === 'item:deleted' ||
          data.type === 'item:updated' ||
          data.type === 'item:moved' ||
          data.type === 'clip:added' ||
          data.type === 'clip:deleted'
        ) {
          scheduleReload();
        }
        if (data.type === 'workspace:created' || data.type === 'workspace:device_added') {
          void loadWorkspaces();
        }
      } catch {
      }
    };
    source.onerror = () => undefined;
    return () => source.close();
  }, [authenticated, loadWorkspaces, currentWsId, scheduleReload]);

  const clearUpload = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setProgress(null);
  }, []);

  const startUpload = useCallback(
    async (files: File[]) => {
      if (!files.length || !currentWsId) return;
      const first = files[0];
      const canPreview = first.type.startsWith('image/') || first.type.startsWith('video/');
      const previewUrl = canPreview ? URL.createObjectURL(first) : undefined;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = previewUrl ?? null;
      const previewKind: UploadProgress['previewKind'] = previewUrl
        ? first.type.startsWith('video/')
          ? 'video'
          : 'image'
        : undefined;
      const runId = ++uploadRunId.current;
      const finish = (delay: number) =>
        window.setTimeout(() => {
          if (uploadRunId.current === runId) clearUpload();
        }, delay);

      setProgress({ fileName: first.name, count: files.length, percent: 0, status: 'uploading', previewUrl, previewKind });
      // Small batches keep memory bounded on phones, and a few batches run at the
      // same time so requests are not queued one round trip behind another.
      const BATCH_SIZE = 4;
      const CONCURRENCY = 3;
      const batches: File[][] = [];
      for (let index = 0; index < files.length; index += BATCH_SIZE) {
        batches.push(files.slice(index, index + BATCH_SIZE));
      }

      const fractions = new Map<number, number>();
      const failures: Error[] = [];
      const uploaded: Item[] = [];
      let nextBatch = 0;

      const reportProgress = () => {
        let finished = 0;
        for (const fraction of fractions.values()) finished += fraction;
        const percent = Math.min(99, Math.round((finished / batches.length) * 100));
        setProgress((current) => (current ? { ...current, percent } : current));
      };

      const runBatch = async (batchIndex: number): Promise<void> => {
        const batch = batches[batchIndex];
        try {
          const res = await api.uploadFiles(batch, folderId, (percent) => {
            fractions.set(batchIndex, percent / 100);
            reportProgress();
          });
          if (!res.success) throw new Error(res.error ?? 'Upload failed');
          fractions.set(batchIndex, 1);
          uploaded.push(...(res.data ?? []));
          reportProgress();
        } catch (err) {
          failures.push(err as Error);
        }
      };

      const worker = async (): Promise<void> => {
        while (failures.length === 0 && nextBatch < batches.length) {
          const batchIndex = nextBatch++;
          await runBatch(batchIndex);
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker())
        );
        if (failures.length > 0) throw failures[0];
        setProgress((current) => (current ? { ...current, percent: 100, status: 'done' } : current));
        notify(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`, 'success');
        scheduleReload();
        finish(4200);
      } catch (err) {
        const message = (err as Error).message;
        setProgress((current) => (current ? { ...current, status: 'error', error: message } : current));
        notify(
          uploaded.length
            ? `Uploaded ${uploaded.length} of ${files.length} files. ${message}`
            : message,
          'error'
        );
        if (uploaded.length) scheduleReload();
        finish(6000);
      }
    },
    [currentWsId, folderId, notify, clearUpload, scheduleReload]
  );

  const openPicker = () => fileInputRef.current?.click();

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    // Clearing later lets iOS finish reading the selection it just handed over.
    window.setTimeout(() => {
      input.value = '';
    }, 0);
    void startUpload(files);
  };

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current += 1;
      if (event.dataTransfer?.types.includes('Files')) setDragActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragActive(false);
      }
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) void startUpload(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [startUpload]);

  const downloadItem = async (item: Item) => {
    const ready = await api.ensureSession(undefined, true);
    if (!ready) {
      notify('Could not refresh this session. Reconnect this device and try again.', 'error');
      return;
    }
    window.location.href = api.downloadUrl(item.id);
  };

  const renameItem = async (item: Item) => {
    const name = window.prompt('Enter new name:', item.originalName);
    if (!name || !name.trim() || name === item.originalName) return;
    const res = await api.renameFile(item.id, name.trim());
    if (res.success) {
      notify('Renamed', 'success');
      setReloadTick((tick) => tick + 1);
    } else {
      notify(res.error ?? 'Rename failed', 'error');
    }
  };

  const deleteItem = async (item: Item) => {
    if (!window.confirm(`Delete ${item.originalName}?`)) return;
    const res = await api.deleteFile(item.id);
    if (res.success) {
      notify('Item deleted', 'info');
      setReloadTick((tick) => tick + 1);
    } else {
      notify(res.error ?? 'Delete failed', 'error');
    }
  };

  const moveItem = async (itemId: string, targetFolderId: string | null) => {
    const res = await api.moveItem(itemId, targetFolderId);
    if (res.success) {
      notify(targetFolderId ? 'Moved to folder' : 'Moved to Files', 'success');
      setReloadTick((tick) => tick + 1);
    } else {
      notify(res.error ?? 'Failed to move item', 'error');
    }
  };

  const createFolder = async () => {
    const name = window.prompt('Enter folder name:');
    if (!name || !name.trim()) return;
    const res = await api.createFolder(name.trim(), folderId);
    if (res.success) {
      notify('Folder created', 'success');
      setReloadTick((tick) => tick + 1);
    } else {
      notify(res.error ?? 'Could not create folder', 'error');
    }
  };

  const copyLink = async (item: Item) => {
    const link = `${window.location.origin}${api.downloadUrl(item.id)}`;
    notify((await copyText(link)) ? 'Download link copied' : 'Failed to copy link', 'success');
  };

  const batchDownload = async () => {
    try {
      notify('Preparing ZIP download...', 'info');
      await api.batchDownload(Array.from(selected));
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const batchDelete = async () => {
    if (!selected.size || !window.confirm(`Delete ${selected.size} selected items?`)) return;
    await api.batchDelete(Array.from(selected));
    setSelected(new Set());
    notify('Selected items deleted', 'info');
    setReloadTick((tick) => tick + 1);
  };

  const addClip = async (content: string): Promise<boolean> => {
    const res = await api.addClip(content, defaultDeviceName());
    if (res.success) {
      notify('Snippet shared', 'success');
      setReloadTick((tick) => tick + 1);
      return true;
    }
    notify(res.error ?? 'Failed to send snippet', 'error');
    return false;
  };

  const deleteClip = async (id: string) => {
    const res = await api.deleteClip(id);
    if (res.success) {
      notify('Snippet deleted', 'info');
      setReloadTick((tick) => tick + 1);
    } else {
      notify(res.error ?? 'Failed to delete snippet', 'error');
    }
  };

  const handleCreated = async (result: CreateWorkspaceResult) => {
    api.setActiveWorkspace(result.workspace.id);
    setAuthenticated(true);
    setIsMaster(result.isMaster);
    setKeyphrase(result.keyphrase);
    setModal('keyphrase');
    await loadWorkspaces();
    notify(`Workspace ${result.workspace.name} created`, 'success');
  };

  const handleAuthorized = async (result: AuthorizationResult) => {
    api.setActiveWorkspace(result.workspace.id);
    setAuthenticated(true);
    setIsMaster(result.isMaster);
    setModal(null);
    setQrScan(null);
    if (window.location.pathname === '/pair' || window.location.search.includes('ws=')) {
      history.replaceState(null, '', '/files');
    }
    await loadWorkspaces();
    notify(`Joined ${result.workspace.name}`, 'success');
  };

  const handleDeleteWorkspace = async () => {
    if (!currentWsId) return;
    if (!instance.allowDeleteWorkspace) {
      notify('Deleting workspaces is disabled on this instance.', 'error');
      return;
    }
    const name = workspaces.find((workspace) => workspace.id === currentWsId)?.name ?? 'this workspace';
    if (
      !window.confirm(
        `Delete "${name}" permanently? Its files, snippets, devices, and sessions will be removed.`
      )
    ) {
      return;
    }

    try {
      const res = await api.deleteWorkspace(currentWsId);
      if (!res.success) {
        notify(res.error ?? 'Could not delete workspace', 'error');
        return;
      }
      await api.forgetWorkspace(currentWsId);

      for (const known of api.knownWorkspaces()) {
        if (await api.ensureSession(known.id)) break;
      }
      window.location.replace('/');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!currentWsId) return;
    if (isMaster) {
      notify('Master devices cannot leave a workspace. Delete it instead.', 'error');
      return;
    }
    if (!instance.allowLeaveWorkspace) {
      notify('Leaving workspaces is disabled on this instance.', 'error');
      return;
    }
    const name = workspaces.find((workspace) => workspace.id === currentWsId)?.name ?? 'this workspace';
    if (
      !window.confirm(
        `Leave "${name}"? This device has to pair again to open it. The files stay on the server.`
      )
    ) {
      return;
    }

    try {
      const res = await api.leaveWorkspace(currentWsId);
      if (!res.success) {
        notify(res.error ?? 'Could not leave workspace', 'error');
        return;
      }
      await api.forgetWorkspace(currentWsId);

      for (const known of api.knownWorkspaces()) {
        if (await api.ensureSession(known.id)) break;
      }
      window.location.replace('/');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const selectWorkspace = async (id: string) => {
    const sessionReady = await api.ensureSession(id);
    if (!sessionReady) {
      setAuthenticated(false);
      setModal('unauthorized');
      notify('Could not authenticate this workspace. Pair it again.', 'error');
      return;
    }
    api.setActiveWorkspace(id);
    setAuthenticated(true);
    setIsMaster(api.isMaster());
    setCurrentWsId(id);
    setFolderId(null);
    setSelected(new Set());
    setItems([]);
    setFilesLoading(true);
    history.replaceState(null, '', '/files');
    setReloadTick((tick) => tick + 1);
  };

  const openDevices = () => {
    if (currentWsId) setModal('devices');
    else setModal(hasWorkspaces ? 'unauthorized' : 'create-workspace');
  };

  const openPair = () => {
    if (!currentWsId) {
      setModal(hasWorkspaces ? 'unauthorized' : 'create-workspace');
      return;
    }
    setModal('pair');
  };

  useEffect(() => {
    if (!context) return undefined;
    const close = () => setContext(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [context]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        document.getElementById('searchInput')?.focus();
      }
      if (event.key === 'Escape') setContext(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openContext = (event: ReactMouseEvent, item: Item | null) => {
    event.preventDefault();
    setContext({ x: event.clientX, y: event.clientY, item });
  };

  const createDismissible = hasWorkspaces || workspaces.length > 0;
  const forceConnect =
    authChecked &&
    !authenticated &&
    modal !== 'qr-scan' &&
    modal !== 'create-workspace' &&
    modal !== 'recover';

  return (
    <>
      <IconSprite />

      <Header
        workspaces={workspaces}
        loading={workspacesLoading}
        currentWorkspaceId={currentWsId}
        hasWorkspaces={hasWorkspaces}
        isMaster={isMaster}
        tab={tab}
        instance={instance}
        onSelectWorkspace={selectWorkspace}
        onTabChange={changeTab}
        onCreateWorkspace={() => setModal('create-workspace')}
        onRecoverWorkspace={() => setModal('recover')}
        onPairDevice={openPair}
        onOpenDevices={openDevices}
        onHome={() => navigate(null)}
        onLeaveWorkspace={handleLeaveWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
      />

      <main className="app-main">
        {authenticated ? (
          tab === 'files' ? (
          <FilesView
            items={items}
            loading={filesLoading && items.length === 0}
            breadcrumbs={breadcrumbs}
            folderId={folderId}
            sort={sort}
            view={view}
            selected={selected}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onViewChange={setView}
            onNavigate={navigate}
            onOpenPreview={openPreview}
            onDownload={downloadItem}
            onRename={renameItem}
            onDelete={deleteItem}
            onMove={moveItem}
            onSelect={(id, checked) =>
              setSelected((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onSelectAll={(checked) => setSelected(checked ? new Set(items.map((i) => i.id)) : new Set())}
            onClearSelection={() => setSelected(new Set())}
            onCreateFolder={createFolder}
            onBatchDownload={batchDownload}
            onBatchDelete={batchDelete}
            onContextMenu={openContext}
          />
          ) : (
            <ClipsView
              clips={clips}
              loading={clipsLoading && clips.length === 0}
              onAdd={addClip}
              onDelete={deleteClip}
              onCopied={(ok) => notify(ok ? 'Snippet copied' : 'Unable to copy snippet', ok ? 'success' : 'error')}
              composerOpen={clipComposerOpen}
              onComposerOpenChange={setClipComposerOpen}
            />
          )
        ) : null}
      </main>

      {authenticated ? (
        <MobileDock
          tab={tab}
          onTabChange={changeTab}
          onUpload={openPicker}
          onCreateClip={() => setClipComposerOpen(true)}
          onConnect={openPair}
        />
      ) : null}

      {authenticated && tab === 'files' ? (
        <button type="button" className="upload-fab" onClick={openPicker} aria-label="Upload files" title="Upload files">
          <Icon name="upload" className="icon" style={{ width: 20, height: 20 }} />
        </button>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="file-input-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFileInputChange}
      />

      <div className={`fullscreen-drag-overlay ${dragActive ? 'active' : ''}`}>
        <div className="overlay-content">
          <Icon name="upload" className="icon icon-lg" style={{ color: 'var(--text-primary)' }} />
          <div style={{ fontSize: 15, fontWeight: 500 }}>Drop files to upload</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Transferring directly over local network</div>
        </div>
      </div>

      <UploadDock progress={progress} onDismiss={clearUpload} />

      <CreateWorkspaceSheet
        open={modal === 'create-workspace'}
        dismissible={authenticated ? createDismissible : true}
        notify={notify}
        onClose={() => setModal(authenticated ? null : 'unauthorized')}
        onCreated={handleCreated}
      />
      <KeyphraseSheet open={modal === 'keyphrase'} keyphrase={keyphrase} notify={notify} onClose={() => setModal(null)} />
      <RecoverSheet
        open={modal === 'recover'}
        notify={notify}
        onClose={() => setModal(authenticated ? null : 'unauthorized')}
        onAuthorized={handleAuthorized}
      />
      <UnauthorizedSheet
        open={modal === 'unauthorized' || forceConnect}
        dismissible={authenticated}
        notify={notify}
        onClose={() => setModal(null)}
        onAuthorized={handleAuthorized}
        onCreateWorkspace={() => setModal('create-workspace')}
        onRecover={() => setModal('recover')}
      />
      <PairSheet
        open={authenticated && modal === 'pair'}
        workspaceId={currentWsId}
        isMaster={isMaster}
        notify={notify}
        onClose={() => setModal(null)}
        onAuthorized={handleAuthorized}
      />
      {qrScan ? (
        <QrScanSheet
          open={modal === 'qr-scan'}
          workspaceId={qrScan.workspaceId}
          pairToken={qrScan.token}
          notify={notify}
          onClose={() => setModal(null)}
          onAuthorized={handleAuthorized}
        />
      ) : null}
      <PreviewSheet open={modal === 'preview'} item={previewItem} onClose={closePreview} />
      <DevicesSheet
        open={authenticated && modal === 'devices'}
        workspaceId={currentWsId}
        isMaster={isMaster}
        notify={notify}
        onClose={() => setModal(null)}
      />

      {context ? (
        <div
          id="contextMenu"
          className="context-menu visible"
          style={{
            display: 'block',
            left: Math.min(context.x, window.innerWidth - CONTEXT_WIDTH - 10),
            top: Math.min(context.y, window.innerHeight - 220),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {context.item ? (
            <>
              <div className="context-menu-header">{context.item.originalName}</div>
              {context.item.isFolder ? (
                <button className="context-item" onClick={() => { navigate(context.item!.id); setContext(null); }}>
                  <Icon name="folder" className="icon icon-sm" />
                  <span>Open folder</span>
                </button>
              ) : (
                <button
                  className="context-item"
                  onClick={() => { openPreview(context.item!); setContext(null); }}
                >
                  <Icon name="eye" className="icon icon-sm" />
                  <span>Preview</span>
                </button>
              )}
              <button
                className="context-item"
                onClick={() => { downloadItem(context.item!); setContext(null); }}
              >
                <Icon name="download" className="icon icon-sm" />
                <span>Download</span>
              </button>
              {context.item.isFolder ? null : (
                <button className="context-item" onClick={() => { void copyLink(context.item!); setContext(null); }}>
                  <Icon name="link" className="icon icon-sm" />
                  <span>Copy direct link</span>
                </button>
              )}
              <button className="context-item" onClick={() => { void renameItem(context.item!); setContext(null); }}>
                <Icon name="edit" className="icon icon-sm" />
                <span>Rename</span>
              </button>
              <div className="context-separator" />
              <button className="context-item text-danger" onClick={() => { void deleteItem(context.item!); setContext(null); }}>
                <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                <span>Delete</span>
              </button>
            </>
          ) : (
            <>
              <button className="context-item" onClick={() => { void createFolder(); setContext(null); }}>
                <Icon name="folder-plus" className="icon icon-sm" />
                <span>New folder</span>
              </button>
              <button className="context-item" onClick={() => { openPicker(); setContext(null); }}>
                <Icon name="upload" className="icon icon-sm" />
                <span>Upload files</span>
              </button>
              <div className="context-separator" />
              <button className="context-item" onClick={() => { setSelected(new Set(items.map((i) => i.id))); setContext(null); }}>
                <Icon name="check" className="icon icon-sm" />
                <span>Select all</span>
              </button>
              <button className="context-item" onClick={() => { setReloadTick((tick) => tick + 1); setContext(null); }}>
                <Icon name="layers" className="icon icon-sm" />
                <span>Refresh</span>
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <Icon
              name={toast.kind === 'error' ? 'x' : toast.kind === 'info' ? 'link' : 'check'}
              className="icon icon-sm toast-icon"
            />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
