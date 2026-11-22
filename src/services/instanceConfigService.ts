import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { ROOT_DIR } from '../config';

const CONFIG_FILE = path.join(ROOT_DIR, 'instance.json');
const DEFAULT_NAME = 'Just Send';
const DEFAULT_ACCENT = '#3b82f6';
const DEFAULT_LOGO = path.join(ROOT_DIR, 'client', 'public', 'favicon.svg');

interface RawInstanceConfig {
  name?: unknown;
  logo?: unknown;
  accentColor?: unknown;
}

export interface InstanceConfig {
  name: string;
  logoUrl: string | null;
  accentColor: string;
}

function readConfigFile(): RawInstanceConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as RawInstanceConfig) : {};
  } catch {
    return {};
  }
}

function textValue(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function accentValue(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())
    ? value.trim()
    : DEFAULT_ACCENT;
}

function resolveLogo(value: unknown): string | null {
  const configured = typeof value === 'string' && value.trim() ? value.trim() : null;
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
  const raw = readConfigFile();
  return {
    name: textValue(raw.name, DEFAULT_NAME, 64),
    accentColor: accentValue(raw.accentColor),
    logoUrl: resolveLogo(raw.logo) ? '/api/system/logo' : null,
  };
}

export function getInstanceLogoPath(): string | null {
  return resolveLogo(readConfigFile().logo);
}
