import path from 'path';
import type { FileCategory } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

export function getFileCategory(filename: string, mimeType = ''): FileCategory {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const mime = (mimeType || '').toLowerCase();

  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'heic', 'avif'].includes(ext)
  ) {
    return 'image';
  }

  if (
    mime.startsWith('video/') ||
    ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'webm', 'flv', 'm4v', '3gp'].includes(ext)
  ) {
    return 'video';
  }

  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)
  ) {
    return 'audio';
  }

  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'tsv'].includes(ext)
  ) {
    return 'document';
  }

  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    mime.includes('archive') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(ext)
  ) {
    return 'archive';
  }

  if (
    ['js', 'mjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'bat', 'ps1', 'sql', 'yaml', 'yml', 'xml', 'md'].includes(ext)
  ) {
    return 'code';
  }

  return 'other';
}

export function sanitizeFilename(originalName: string): string {
  const base = path.basename(originalName);
  return base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'unnamed_file';
}
