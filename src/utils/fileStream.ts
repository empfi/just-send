import fs from 'fs';
import type { Request, Response } from 'express';

function encodeDispositionName(name: string): string {
  const encoded = encodeURIComponent(name)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `${name.replace(/"/g, '_')}; filename*=UTF-8''${encoded}`;
}

interface StreamOptions {
  filePath: string;
  contentType: string;
  name: string;
  disposition: 'inline' | 'attachment';
  allowFraming?: boolean;
  cacheControl?: string;
}

// Shared by session-scoped previews and public share links so range requests,
// ETags and framing headers stay consistent.
export async function streamStoredFile(
  req: Request,
  res: Response,
  options: StreamOptions
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(options.filePath);
  } catch {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const fileSize = stat.size;
  const etag = `W/"${fileSize.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

  res.setHeader('Content-Type', options.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  // Downloads must reach the server so share limits are enforced; previews may cache.
  res.setHeader(
    'Cache-Control',
    options.cacheControl ?? (options.disposition === 'attachment' ? 'private, no-store' : 'private, max-age=86400')
  );
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Content-Disposition', `${options.disposition}; filename="${encodeDispositionName(options.name)}"`);
  if (options.allowFraming) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  }

  const range = req.headers.range;
  if (!range && req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (Number.isNaN(start) || start >= fileSize || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      res.end();
      return;
    }

    const chunksize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': options.contentType,
    });
    fs.createReadStream(options.filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', fileSize);
  fs.createReadStream(options.filePath).pipe(res);
}
