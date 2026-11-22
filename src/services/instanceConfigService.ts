import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { ROOT_DIR } from '../config';

const DEFAULT_NAME = 'Just Send';
const DEFAULT_ACCENT = '#3b82f6';
const DEFAULT_LOGO = path.join(ROOT_DIR, 'client', 'public', 'favicon.svg');

export interface InstanceConfig {
  name: string;
  logoUrl: string | null;
  accentColor: string;
}

function textValue(value: string | undefined, fallback: string, maxLength: number): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function accentValue(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && /^#[0-9a-f]{3,8}$/i.test(trimmed) ? trimmed : DEFAULT_ACCENT;
}

function resolveLogo(): string | null {
  const configured = process.env.INSTANCE_LOGO?.trim();
  const candidate = configured ? path.resolve(ROOT_DIR, configured) : DEFAULT_LOGO;
  const relative = path.relative(ROOT_DIR, candidate);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;

  try {
    if (!fs.statSync(candidate).isFile()) return null;
    const contentType = mime.lookup(candidate);
    if (!contentType || !contentType.startsWith('image/')) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function getInstanceConfig(): InstanceConfig {
  return {
    name: textValue(process.env.INSTANCE_NAME, DEFAULT_NAME, 64),
    accentColor: accentValue(process.env.INSTANCE_ACCENT_COLOR),
    logoUrl: resolveLogo() ? '/api/system/logo' : null,
  };
}

export function getInstanceLogoPath(): string | null {
  return resolveLogo();
}
