import { useEffect, useState } from 'react';
import { Icon } from './Icon';

const COMPACT_LAYOUT = '(max-width: 640px)';

export type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
export type UploadQueueStatus = 'uploading' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  percent: number;
  status: UploadItemStatus;
  error?: string;
}

export interface UploadQueue {
  items: UploadItem[];
  status: UploadQueueStatus;
  percent: number;
}

interface UploadDockProps {
  queue: UploadQueue | null;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

function itemState(item: UploadItem): string {
  switch (item.status) {
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'uploading':
      return `${item.percent}%`;
    default:
      return 'Waiting';
  }
}

export function UploadDock({ queue, onCancel, onRetry, onDismiss }: UploadDockProps) {
  const [open, setOpen] = useState(() => !window.matchMedia(COMPACT_LAYOUT).matches);

  useEffect(() => {
    // On phones the compact bar stays collapsed unless something needs attention.
    const needsAttention = queue?.status === 'error' || queue?.status === 'cancelled';
    setOpen(!window.matchMedia(COMPACT_LAYOUT).matches || needsAttention);
  }, [queue?.status, queue?.items.length]);

  if (!queue) return null;

  const total = queue.items.length;
  const done = queue.items.filter((item) => item.status === 'done').length;
  const retryable = queue.items.filter(
    (item) => item.status === 'error' || item.status === 'cancelled'
  ).length;
  const failed = queue.status === 'error';
  const cancelled = queue.status === 'cancelled';
  const finished = queue.status === 'done';

  const title = finished
    ? `Uploaded ${total} file${total === 1 ? '' : 's'}`
    : failed
      ? `${done} of ${total} uploaded`
      : cancelled
        ? 'Upload cancelled'
        : `Uploading ${done} of ${total}`;

  return (
    <section
      className={`upload-dock ${finished ? 'is-done' : ''} ${failed || cancelled ? 'is-error' : ''}`}
      aria-label="Upload status"
    >
      <div className="upload-dock-bar">
        <button
          type="button"
          className="upload-dock-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="upload-dock-state">
            <Icon name={finished ? 'check' : failed || cancelled ? 'x' : 'upload'} className="icon icon-sm" />
          </span>
          <span className="upload-dock-title">{title}</span>
          {finished || failed || cancelled ? null : (
            <span className="upload-dock-percent tabular">{queue.percent}%</span>
          )}
          <Icon name="chevron-down" className={`icon icon-sm upload-dock-chevron ${open ? 'open' : ''}`} />
        </button>
        <button type="button" className="upload-dock-close" onClick={onDismiss} aria-label="Dismiss upload">
          <Icon name="x" className="icon icon-sm" />
        </button>
      </div>

      {open ? (
        <div className="upload-dock-body">
          <div className="upload-dock-track">
            <div
              className="upload-dock-fill"
              style={{ transform: `scaleX(${(finished ? 100 : queue.percent) / 100})` }}
            />
          </div>

          <div className="upload-dock-list">
            {queue.items.map((item) => (
              <div
                key={item.id}
                className={`upload-dock-row ${item.status === 'error' ? 'is-error' : ''} ${
                  item.status === 'done' ? 'is-done' : ''
                }`}
                title={item.error ?? item.name}
              >
                <span className="upload-dock-row-name">{item.name}</span>
                <span className="upload-dock-row-state tabular">{itemState(item)}</span>
                {item.status === 'error' && item.error ? (
                  <span className="upload-dock-row-error">{item.error}</span>
                ) : null}
                <div className="upload-dock-row-track">
                  <div
                    className="upload-dock-row-fill"
                    style={{
                      transform: `scaleX(${(item.status === 'done' ? 100 : item.percent) / 100})`,
                      opacity: item.status === 'error' ? 0 : 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {queue.status === 'uploading' || retryable > 0 ? (
            <div className="upload-dock-actions">
              {queue.status === 'uploading' ? (
                <button type="button" className="btn btn-subtle" onClick={onCancel}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={onRetry}>
                  Retry {retryable} file{retryable === 1 ? '' : 's'}
                </button>
              )}
              {queue.status !== 'uploading' ? (
                <button type="button" className="btn btn-subtle" onClick={onDismiss}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
