import fs from 'fs';
import crypto from 'crypto';
import workspaceService from './workspaceService';
import sseService from './sseService';
import type { ClipRecord } from '../types';

class TextClipService {
  private clipsCache = new Map<string, ClipRecord[]>();

  loadClips(workspaceId: string): ClipRecord[] {
    const cached = this.clipsCache.get(workspaceId);
    if (cached) return cached;

    const clipsFile = workspaceService.getWorkspaceClipsFile(workspaceId);
    let list: ClipRecord[] = [];
    try {
      if (fs.existsSync(clipsFile)) {
        list = JSON.parse(fs.readFileSync(clipsFile, 'utf8')) as ClipRecord[];
      }
    } catch (err) {
      console.error(`Error reading clips for ${workspaceId}:`, err);
    }

    this.clipsCache.set(workspaceId, list);
    return list;
  }

  saveClips(workspaceId: string): void {
    const list = this.clipsCache.get(workspaceId) || [];
    const clipsFile = workspaceService.getWorkspaceClipsFile(workspaceId);
    try {
      fs.writeFileSync(clipsFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error(`Error saving clips for ${workspaceId}:`, err);
    }
  }

  addClip(workspaceId: string, { content, sender = 'Device' }: { content: string; sender?: string }): ClipRecord | null {
    if (!content || !content.trim()) return null;
    const list = this.loadClips(workspaceId);

    const clip: ClipRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      content: content.trim(),
      sender: sender.trim() || 'Device',
      createdAt: new Date().toISOString(),
    };

    list.unshift(clip);
    if (list.length > 100) list.splice(100);

    this.saveClips(workspaceId);
    sseService.broadcast('clip:added', { workspaceId, clip });
    return clip;
  }

  getClips(workspaceId: string): ClipRecord[] {
    return this.loadClips(workspaceId);
  }

  deleteClip(workspaceId: string, id: string): ClipRecord | null {
    const list = this.loadClips(workspaceId);
    const idx = list.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const removed = list.splice(idx, 1)[0];
      this.saveClips(workspaceId);
      sseService.broadcast('clip:deleted', { workspaceId, id });
      return removed;
    }
    return null;
  }
}

export default new TextClipService();
