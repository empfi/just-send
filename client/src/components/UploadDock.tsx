import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { FileTypeIcon } from './FileTypeIcon';

const COMPACT_LAYOUT = '(max-width: 640px)';

export interface UploadProgress {
  fileName: string;
  count: number;
  percent: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  previewUrl?: string;
  previewKind?: 'image' | 'video';
}

interface UploadDockProps {
  progress: UploadProgress | null;
  onDismiss: () => void;
}

export function UploadDock({ progress, onDismiss }: UploadDockProps) {
  const [open, setOpen] = useState(() => !window.matchMedia(COMPACT_LAYOUT).matches);

  useEffect(() => {
    // On phones the compact bar stays collapsed unless something went wrong.
    setOpen(!window.matchMedia(COMPACT_LAYOUT).matches || progress?.status === 'error');
  }, [progress?.fileName, progress?.status]);

  if (!progress) return null;

  const done = progress.status === 'done';
  const failed = progress.status === 'error';
  const percent = done ? 100 : progress.percent;
  const title = done
    ? `Uploaded ${progress.count} file${progress.count === 1 ? '' : 's'}`
    : failed
      ? 'Upload failed'
      : `Uploading ${progress.count} file${progress.count === 1 ? '' : 's'}`;

  return (
    <section className={`upload-dock ${done ? 'is-done' : ''} ${failed ? 'is-error' : ''}`} aria-label="Upload status">
      <div className="upload-dock-bar">
        <button type="button" className="upload-dock-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="upload-dock-state">
            <Icon name={done ? 'check' : failed ? 'x' : 'upload'} className="icon icon-sm" />
          </span>
          <span className="upload-dock-title">{title}</span>
          {done || failed ? null : <span className="upload-dock-percent tabular">{percent}%</span>}
          <Icon name="chevron-down" className={`icon icon-sm upload-dock-chevron ${open ? 'open' : ''}`} />
        </button>
        <button type="button" className="upload-dock-close" onClick={onDismiss} aria-label="Dismiss upload">
          <Icon name="x" className="icon icon-sm" />
        </button>
      </div>

      {open ? (
        <div className="upload-dock-body">
          <div className="upload-dock-track">
            <div className="upload-dock-fill" style={{ width: `${percent}%` }} />
          </div>

          <div className="upload-dock-item">
            <div className="upload-dock-preview">
              {progress.previewKind === 'image' && progress.previewUrl ? (
                <img src={progress.previewUrl} alt="" />
              ) : progress.previewKind === 'video' && progress.previewUrl ? (
                <video src={progress.previewUrl} muted playsInline preload="metadata" />
              ) : (
                <FileTypeIcon name={progress.fileName} category="other" className="file-type-icon-sm" />
              )}
            </div>
            <div className="upload-dock-meta">
              <span className="upload-dock-name" title={progress.fileName}>
                {progress.fileName}
              </span>
              <span className="upload-dock-sub">
                {progress.count > 1 ? `+${progress.count - 1} more · ` : ''}
                {done ? 'Complete' : failed ? progress.error ?? 'Upload failed' : 'Uploading'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
