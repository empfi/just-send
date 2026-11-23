import type { FileCategory } from '../types';

interface FileTypeLookup {
  label: string;
  color: string;
}

const BY_EXTENSION: Record<string, FileTypeLookup> = {
  pdf: { label: 'PDF', color: '#dc2626' },
  doc: { label: 'DOC', color: '#2563eb' },
  docx: { label: 'DOC', color: '#2563eb' },
  rtf: { label: 'RTF', color: '#2563eb' },
  odt: { label: 'DOC', color: '#2563eb' },
  pages: { label: 'DOC', color: '#2563eb' },
  xls: { label: 'XLS', color: '#15803d' },
  xlsx: { label: 'XLS', color: '#15803d' },
  csv: { label: 'CSV', color: '#15803d' },
  ods: { label: 'XLS', color: '#15803d' },
  numbers: { label: 'XLS', color: '#15803d' },
  ppt: { label: 'PPT', color: '#ea580c' },
  pptx: { label: 'PPT', color: '#ea580c' },
  odp: { label: 'PPT', color: '#ea580c' },
  key: { label: 'PPT', color: '#ea580c' },
  zip: { label: 'ZIP', color: '#b45309' },
  rar: { label: 'RAR', color: '#b45309' },
  '7z': { label: '7Z', color: '#b45309' },
  tar: { label: 'TAR', color: '#b45309' },
  gz: { label: 'GZ', color: '#b45309' },
  txt: { label: 'TXT', color: '#475569' },
  md: { label: 'MD', color: '#475569' },
  log: { label: 'LOG', color: '#475569' },
  json: { label: 'JSON', color: '#7c3aed' },
  xml: { label: 'XML', color: '#7c3aed' },
  yml: { label: 'YML', color: '#7c3aed' },
  yaml: { label: 'YML', color: '#7c3aed' },
  html: { label: 'HTML', color: '#c2410c' },
  css: { label: 'CSS', color: '#0891b2' },
  js: { label: 'JS', color: '#ca8a04' },
  mjs: { label: 'JS', color: '#ca8a04' },
  ts: { label: 'TS', color: '#2563eb' },
  tsx: { label: 'TSX', color: '#2563eb' },
  jsx: { label: 'JSX', color: '#2563eb' },
  py: { label: 'PY', color: '#0284c7' },
  sh: { label: 'SH', color: '#334155' },
  sql: { label: 'SQL', color: '#0369a1' },
  mp3: { label: 'MP3', color: '#db2777' },
  m4a: { label: 'M4A', color: '#db2777' },
  wav: { label: 'WAV', color: '#db2777' },
  flac: { label: 'FLAC', color: '#db2777' },
  ogg: { label: 'OGG', color: '#db2777' },
  aac: { label: 'AAC', color: '#db2777' },
  mp4: { label: 'MP4', color: '#4f46e5' },
  mov: { label: 'MOV', color: '#4f46e5' },
  mkv: { label: 'MKV', color: '#4f46e5' },
  webm: { label: 'WEBM', color: '#4f46e5' },
  avi: { label: 'AVI', color: '#4f46e5' },
  jpg: { label: 'JPG', color: '#0ea5e9' },
  jpeg: { label: 'JPG', color: '#0ea5e9' },
  png: { label: 'PNG', color: '#0ea5e9' },
  gif: { label: 'GIF', color: '#0ea5e9' },
  webp: { label: 'WEBP', color: '#0ea5e9' },
  heic: { label: 'HEIC', color: '#0ea5e9' },
  svg: { label: 'SVG', color: '#0ea5e9' },
};

const BY_CATEGORY: Record<FileCategory, FileTypeLookup> = {
  folder: { label: 'DIR', color: '#64748b' },
  image: { label: 'IMG', color: '#0ea5e9' },
  video: { label: 'VID', color: '#4f46e5' },
  audio: { label: 'AUD', color: '#db2777' },
  archive: { label: 'ZIP', color: '#b45309' },
  code: { label: 'CODE', color: '#7c3aed' },
  document: { label: 'DOC', color: '#475569' },
  other: { label: 'FILE', color: '#64748b' },
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 1 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function describeFileType(name: string, category: FileCategory): FileTypeLookup {
  return BY_EXTENSION[extensionOf(name)] ?? BY_CATEGORY[category] ?? BY_CATEGORY.other;
}

interface FileTypeIconProps {
  name: string;
  category: FileCategory;
  className?: string;
}

export function FileTypeIcon({ name, category, className = '' }: FileTypeIconProps) {
  const { label, color } = describeFileType(name, category);
  const fontSize = label.length >= 4 ? 9 : label.length === 3 ? 10.5 : 12;

  return (
    <svg
      viewBox="0 0 40 52"
      className={`file-type-icon ${className}`.trim()}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d="M5 1h20.5L37 12.5V47a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z" fill={color} />
      <path d="M25.5 1 37 12.5h-7.5a4 4 0 0 1-4-4V1Z" fill="#ffffff" fillOpacity="0.38" />
      <text
        x="18.5"
        y="37"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing="0.2"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        fill="#ffffff"
      >
        {label}
      </text>
    </svg>
  );
}
