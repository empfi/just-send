import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Response } from 'express';
import mime from 'mime-types';
import archiver from 'archiver';
import workspaceService from './workspaceService';
import sseService from './sseService';
import { formatBytes, getFileCategory, sanitizeFilename } from '../utils/formatters';
import type { FileCategory, StoredItem } from '../types';

type MetadataMap = Record<string, StoredItem>;

class FileService {
  private metadataCache = new Map<string, MetadataMap>();

  loadMetadata(workspaceId: string): MetadataMap {
    const cached = this.metadataCache.get(workspaceId);
    if (cached) return cached;

    const metaFile = workspaceService.getWorkspaceMetaFile(workspaceId);
    let data: MetadataMap = {};
    try {
      if (fs.existsSync(metaFile)) {
        data = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as MetadataMap;
      }
    } catch (err) {
      console.error(`Error loading metadata for workspace ${workspaceId}:`, err);
    }

    this.metadataCache.set(workspaceId, data);
    this.syncDiskFiles(workspaceId);
    return data;
  }

  saveMetadata(workspaceId: string): void {
    const data = this.metadataCache.get(workspaceId) || {};
    const metaFile = workspaceService.getWorkspaceMetaFile(workspaceId);
    try {
      // Machines read this file, so skip the pretty printing and save the bytes.
      fs.writeFileSync(metaFile, JSON.stringify(data), 'utf8');
    } catch (err) {
      console.error(`Error saving metadata for workspace ${workspaceId}:`, err);
    }
  }

  syncDiskFiles(workspaceId: string): void {
    try {
      const uploadsDir = workspaceService.getWorkspaceUploadsDir(workspaceId);
      const files = fs.readdirSync(uploadsDir);
      const meta = this.metadataCache.get(workspaceId) || {};
      const knownNames = new Set(
        Object.values(meta)
          .filter((m) => !m.isFolder && m.storedName)
          .map((m) => m.storedName as string)
      );
      let changed = false;

      for (const file of files) {
        if (file === '.gitkeep' || knownNames.has(file)) continue;
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) continue;

        const id = crypto.randomUUID();
        const mimeType = mime.lookup(file) || 'application/octet-stream';
        meta[id] = {
          id,
          workspaceId,
          isFolder: false,
          folderId: null,
          originalName: file,
          storedName: file,
          size: stats.size,
          mimeType,
          category: getFileCategory(file, mimeType),
          uploadedAt: stats.birthtime ? stats.birthtime.toISOString() : new Date().toISOString(),
          downloadCount: 0,
        };
        knownNames.add(file);
        changed = true;
      }

      for (const [id, m] of Object.entries(meta)) {
        if (m.isFolder) continue;
        const filePath = path.join(uploadsDir, m.storedName ?? '');
        if (!fs.existsSync(filePath)) {
          delete meta[id];
          changed = true;
        }
      }

      if (changed) {
        this.saveMetadata(workspaceId);
      }
    } catch (err) {
      console.error(`Error syncing workspace files ${workspaceId}:`, err);
    }
  }

  createFolder(workspaceId: string, name: string, parentFolderId: string | null = null): StoredItem {
    const meta = this.loadMetadata(workspaceId);
    const id = crypto.randomUUID();
    const safeName = sanitizeFilename(name);

    const folder: StoredItem = {
      id,
      workspaceId,
      isFolder: true,
      folderId: parentFolderId || null,
      originalName: safeName,
      storedName: null,
      size: 0,
      formattedSize: '--',
      mimeType: 'folder',
      category: 'folder',
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
    };

    meta[id] = folder;
    this.saveMetadata(workspaceId);
    sseService.broadcast('item:created', { workspaceId, item: folder });
    return folder;
  }

  private buildRecord(
    workspaceId: string,
    multerFile: Express.Multer.File,
    folderId: string | null,
    uploaderDeviceId: string | null
  ): StoredItem {
    const originalName = sanitizeFilename(multerFile.originalname);
    const mimeType = multerFile.mimetype || mime.lookup(originalName) || 'application/octet-stream';
    const category: FileCategory = getFileCategory(originalName, mimeType);

    return {
      id: crypto.randomUUID(),
      workspaceId,
      isFolder: false,
      folderId: folderId || null,
      originalName,
      storedName: multerFile.filename,
      size: multerFile.size,
      formattedSize: formatBytes(multerFile.size),
      mimeType,
      category,
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
      uploaderDeviceId,
    };
  }

  addFiles(
    workspaceId: string,
    multerFiles: Express.Multer.File[],
    folderId: string | null = null,
    uploaderDeviceId: string | null = null
  ): StoredItem[] {
    if (multerFiles.length === 0) return [];

    const meta = this.loadMetadata(workspaceId);
    const records = multerFiles.map((file) => this.buildRecord(workspaceId, file, folderId, uploaderDeviceId));
    for (const record of records) meta[record.id] = record;
    // One metadata write per upload batch instead of one per file.
    this.saveMetadata(workspaceId);
    for (const record of records) sseService.broadcast('file:uploaded', { workspaceId, item: record });
    return records;
  }

  addFile(
    workspaceId: string,
    multerFile: Express.Multer.File,
    folderId: string | null = null,
    uploaderDeviceId: string | null = null
  ): StoredItem {
    return this.addFiles(workspaceId, [multerFile], folderId, uploaderDeviceId)[0];
  }

  getItems(
    workspaceId: string,
    { folderId = null, search = '', sort = 'date', order = 'desc' }: {
      folderId?: string | null;
      search?: string;
      sort?: string;
      order?: string;
    } = {}
  ): StoredItem[] {
    const meta = this.loadMetadata(workspaceId);
    const entries = Object.values(meta);
    const q = search.trim().toLowerCase();
    const targetFolder = folderId && folderId !== 'null' && folderId !== 'root' ? folderId : null;

    let list: StoredItem[] = q
      ? entries.filter(
          (f) =>
            f.originalName.toLowerCase().includes(q) ||
            (f.category && f.category.toLowerCase().includes(q))
        )
      : entries.filter((f) => f.folderId === targetFolder);

    // One pass over the workspace collects folder previews instead of a scan per folder.
    const previews = new Map<string, StoredItem[]>();
    if (list.some((item) => item.isFolder)) {
      const folderIds = new Set(list.filter((item) => item.isFolder).map((item) => item.id));
      for (const child of entries) {
        if (child.isFolder || child.category !== 'image') continue;
        if (!child.folderId || !folderIds.has(child.folderId)) continue;
        const bucket = previews.get(child.folderId);
        if (bucket) bucket.push(child);
        else previews.set(child.folderId, [child]);
      }
      for (const [id, children] of previews) {
        children.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        previews.set(id, children.slice(0, 4));
      }
    }

    list = list.map((item) => {
      const formattedSize = item.isFolder ? '--' : formatBytes(item.size);
      if (!item.isFolder) return { ...item, formattedSize };
      const previewImageIds = (previews.get(item.id) ?? []).map((child) => child.id);
      return { ...item, formattedSize, previewImageIds };
    });

    list.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      if (sort === 'name') {
        const valA = a.originalName.toLowerCase();
        const valB = b.originalName.toLowerCase();
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sort === 'size') {
        const valA = a.size || 0;
        const valB = b.size || 0;
        return order === 'asc' ? valA - valB : valB - valA;
      }
      const valA = new Date(a.uploadedAt).getTime();
      const valB = new Date(b.uploadedAt).getTime();
      return order === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }

  // Flattens the selected items into the files a share link will serve, keeping
  // folder names so nested selections stay readable in the public list.
  collectShareFiles(workspaceId: string, ids: string[]): Array<{ itemId: string; displayPath: string }> {
    const meta = this.loadMetadata(workspaceId);
    const out: Array<{ itemId: string; displayPath: string }> = [];
    const seen = new Set<string>();

    const walk = (id: string, prefix: string): void => {
      const item = meta[id];
      if (!item || seen.has(id)) return;
      seen.add(id);
      const displayPath = prefix ? `${prefix}/${item.originalName}` : item.originalName;
      if (!item.isFolder) {
        out.push({ itemId: item.id, displayPath });
        return;
      }
      for (const child of Object.values(meta)) {
        if (child.folderId === item.id) walk(child.id, displayPath);
      }
    };

    for (const id of ids) walk(id, '');
    return out;
  }

  getBreadcrumbs(workspaceId: string, folderId: string): Array<{ id: string; name: string }> {
    const meta = this.loadMetadata(workspaceId);
    const crumbs: Array<{ id: string; name: string }> = [];
    let cur: string | null = folderId;

    while (cur && cur !== 'null' && cur !== 'root') {
      const f: StoredItem | undefined = meta[cur];
      if (!f || !f.isFolder) break;
      crumbs.unshift({ id: f.id, name: f.originalName });
      cur = f.folderId;
    }

    return crumbs;
  }

  getItemById(workspaceId: string, id: string): (StoredItem & { fullPath?: string }) | null {
    const meta = this.loadMetadata(workspaceId);
    const item = meta[id];
    if (!item) return null;

    if (item.isFolder) return item;

    const uploadsDir = workspaceService.getWorkspaceUploadsDir(workspaceId);
    const fullPath = path.join(uploadsDir, item.storedName ?? '');
    if (!fs.existsSync(fullPath)) return null;

    return {
      ...item,
      fullPath,
      formattedSize: formatBytes(item.size),
    };
  }

  moveItem(workspaceId: string, itemId: string, targetFolderId: string | null = null): StoredItem | null {
    const meta = this.loadMetadata(workspaceId);
    const item = meta[itemId];
    if (!item) return null;

    if (item.isFolder && itemId === targetFolderId) return null;

    if (item.isFolder && targetFolderId) {
      let cur: string | null = targetFolderId;
      while (cur) {
        if (cur === itemId) return null;
        const p: StoredItem | undefined = meta[cur];
        cur = p ? p.folderId : null;
      }
    }

    item.folderId = targetFolderId === 'root' || !targetFolderId ? null : targetFolderId;
    this.saveMetadata(workspaceId);
    sseService.broadcast('item:moved', { workspaceId, item });
    return item;
  }

  renameItem(workspaceId: string, id: string, newName: string): StoredItem | null {
    const meta = this.loadMetadata(workspaceId);
    const item = meta[id];
    if (!item) return null;

    let sanitized = sanitizeFilename(newName);
    if (!item.isFolder) {
      const origExt = path.extname(item.originalName);
      const newExt = path.extname(sanitized);
      if (!newExt && origExt) {
        sanitized += origExt;
      }
      item.category = getFileCategory(sanitized, item.mimeType);
    }

    item.originalName = sanitized;
    this.saveMetadata(workspaceId);
    sseService.broadcast('item:updated', { workspaceId, item });
    return item;
  }

  deleteItem(workspaceId: string, id: string): boolean {
    const meta = this.loadMetadata(workspaceId);
    const item = meta[id];
    if (!item) return false;

    if (item.isFolder) {
      const children = Object.values(meta).filter((c) => c.folderId === id);
      for (const child of children) {
        this.deleteItem(workspaceId, child.id);
      }
      delete meta[id];
      this.saveMetadata(workspaceId);
      sseService.broadcast('item:deleted', { workspaceId, id, isFolder: true });
      return true;
    }

    const uploadsDir = workspaceService.getWorkspaceUploadsDir(workspaceId);
    const filePath = path.join(uploadsDir, item.storedName ?? '');
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      delete meta[id];
      this.saveMetadata(workspaceId);
      sseService.broadcast('item:deleted', { workspaceId, id, isFolder: false });
      return true;
    } catch (err) {
      console.error(`Error deleting item ${id}:`, err);
      return false;
    }
  }

  batchDelete(workspaceId: string, ids: string[] = []): { deleted: string[]; failed: string[] } {
    const results: { deleted: string[]; failed: string[] } = { deleted: [], failed: [] };
    for (const id of ids) {
      if (this.deleteItem(workspaceId, id)) {
        results.deleted.push(id);
      } else {
        results.failed.push(id);
      }
    }
    return results;
  }

  streamZip(workspaceId: string, ids: string[], res: Response, zipName = 'just-send-bundle.zip'): void {
    const archive = archiver('zip', { zlib: { level: 5 } });
    res.attachment(zipName);
    res.setHeader('Content-Type', 'application/zip');
    archive.pipe(res);

    const meta = this.loadMetadata(workspaceId);

    const addFolderRecursive = (fId: string, curPath: string): void => {
      const children = Object.values(meta).filter((c) => c.folderId === fId);
      for (const child of children) {
        if (child.isFolder) {
          addFolderRecursive(child.id, path.join(curPath, child.originalName));
        } else {
          const file = this.getItemById(workspaceId, child.id);
          if (file?.fullPath && fs.existsSync(file.fullPath)) {
            archive.file(file.fullPath, { name: path.join(curPath, file.originalName) });
          }
        }
      }
    };

    for (const id of ids) {
      const item = meta[id];
      if (!item) continue;
      if (item.isFolder) {
        addFolderRecursive(item.id, item.originalName);
      } else {
        const file = this.getItemById(workspaceId, id);
        if (file?.fullPath && fs.existsSync(file.fullPath)) {
          archive.file(file.fullPath, { name: file.originalName });
        }
      }
    }

    void archive.finalize();
  }
}

export default new FileService();
