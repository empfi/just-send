import express from 'express';
import fs from 'fs';
import mime from 'mime-types';
import upload from '../middleware/upload';
import fileService from '../services/fileService';
import textClipService from '../services/textClipService';
import { requireSession, authed } from '../middleware/auth';

const router = express.Router();

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}




router.get('/files', requireSession, (req, res) => {
  try {
    const { folderId, search, sort, order } = req.query;
    const wsId = authed(req).workspace.id;
    const items = fileService.getItems(wsId, {
      folderId: queryString(folderId) ?? null,
      search: queryString(search) ?? '',
      sort: queryString(sort) ?? 'date',
      order: queryString(order) ?? 'desc',
    });
    const breadcrumbs = queryString(folderId) ? fileService.getBreadcrumbs(wsId, queryString(folderId)!) : [];

    res.json({
      success: true,
      data: items,
      breadcrumbs,
      count: items.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/folders', requireSession, (req, res) => {
  try {
    const { name, parentFolderId } = req.body as { name?: string; parentFolderId?: string | null };
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Folder name cannot be empty' });
      return;
    }

    const folder = fileService.createFolder(authed(req).workspace.id, name.trim(), parentFolderId ?? null);
    res.status(201).json({ success: true, data: folder });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/files/:id/move', requireSession, (req, res) => {
  try {
    const { targetFolderId } = req.body as { targetFolderId?: string | null };
    const updated = fileService.moveItem(authed(req).workspace.id, req.params.id, targetFolderId ?? null);
    if (!updated) {
      res.status(400).json({ success: false, error: 'Could not move item' });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/files/upload', requireSession, upload.array('files', 100), (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files provided' });
      return;
    }

    const auth = authed(req);
    const folderId = (req.body?.folderId as string | undefined) || null;
    const uploaded = files.map((f) => fileService.addFile(auth.workspace.id, f, folderId, auth.device.id));

    res.status(201).json({
      success: true,
      message: `Uploaded ${uploaded.length} file(s)`,
      data: uploaded,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/files/:id/download', requireSession, (req, res) => {
  try {
    const auth = authed(req);

    const item = fileService.getItemById(auth.workspace.id, req.params.id);
    if (!item) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    if (item.isFolder) {
      fileService.streamZip(auth.workspace.id, [item.id], res, `${item.originalName}.zip`);
      return;
    }

    if (!item.fullPath) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    const encodedName = encodeURIComponent(item.originalName)
      .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/\*/g, '%2A');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${item.originalName.replace(/"/g, '_')}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', item.size);

    const stream = fs.createReadStream(item.fullPath);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/files/:id/preview', requireSession, (req, res) => {
  try {
    const auth = authed(req);

    const file = fileService.getItemById(auth.workspace.id, req.params.id);
    if (!file || file.isFolder || !file.fullPath) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const filePath = file.fullPath;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = file.mimeType || mime.lookup(file.originalName) || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        res.end();
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      fileStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.patch('/files/:id/rename', requireSession, (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Name cannot be blank' });
      return;
    }
    const updated = fileService.renameItem(authed(req).workspace.id, req.params.id, name.trim());
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/files/:id', requireSession, (req, res) => {
  try {
    const deleted = fileService.deleteItem(authed(req).workspace.id, req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/files/batch-download', requireSession, (req, res) => {
  try {
    const { ids, archiveName } = req.body as { ids?: string[]; archiveName?: string };
    const name = archiveName ? `${archiveName}.zip` : `just-send-${Date.now()}.zip`;
    fileService.streamZip(authed(req).workspace.id, ids ?? [], res, name);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/files/batch-delete', requireSession, (req, res) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    const result = fileService.batchDelete(authed(req).workspace.id, ids ?? []);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/stats', requireSession, (req, res) => {
  try {
    const stats = fileService.getStats(authed(req).workspace.id);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/clips', requireSession, (req, res) => {
  try {
    const clips = textClipService.getClips(authed(req).workspace.id);
    res.json({ success: true, data: clips });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/clips', requireSession, (req, res) => {
  try {
    const { content, sender } = req.body as { content?: string; sender?: string };
    if (!content || !content.trim()) {
      res.status(400).json({ success: false, error: 'Content cannot be empty' });
      return;
    }
    const auth = authed(req);
    const clip = textClipService.addClip(auth.workspace.id, {
      content,
      sender: sender || auth.device.name,
    });
    res.status(201).json({ success: true, data: clip });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/clips/:id', requireSession, (req, res) => {
  try {
    textClipService.deleteClip(authed(req).workspace.id, req.params.id);
    res.json({ success: true, message: 'Removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
