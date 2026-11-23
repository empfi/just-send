import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { api } from '../../api';
import type { Item } from '../../types';
import { Icon } from '../Icon';
import { FileTypeIcon } from '../FileTypeIcon';
import { PreviewSkeleton } from '../Skeletons';
import { canEmbedPdfInline, displayName } from '../../utils';

interface Props {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

const UNMOUNT_DELAY = 280;

// Averages the photo down to one colour so the preview backdrop can take it on.
function readTint(img: HTMLImageElement): string | null {
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(img, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 8) continue;
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      count += 1;
    }
    if (!count) return null;
    // Dim the wash so the photo and the white filename stay readable.
    const dim = 0.78;
    return `${Math.round((r / count) * dim)}, ${Math.round((g / count) * dim)}, ${Math.round((b / count) * dim)}`;
  } catch {
    return null;
  }
}

export function PreviewSheet({
  open,
  item,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: Props) {
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [tint, setTint] = useState<string | null>(null);
  const [mounted, setMounted] = useState(open);
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const swipeConsumed = useRef(false);
  const swipeResetTimer = useRef<number | undefined>(undefined);

  const isText =
    !!item &&
    (item.category === 'code' ||
      item.mimeType.startsWith('text/') ||
      /\.(txt|json|md)$/i.test(item.originalName));

  // Reset before paint so moving to another file never flashes the old image.
  useLayoutEffect(() => {
    if (!open) return;
    setImageReady(false);
    setImageError(false);
    setTint(null);
  }, [open, item?.id]);

  useEffect(() => {
    setText('');
    if (!open || !item || !isText) {
      setLoadingText(false);
      return;
    }
    let cancelled = false;
    setLoadingText(true);
    fetch(api.previewUrl(item.id))
      .then(async (res) => (res.ok ? res.text() : 'Unable to preview file content.'))
      .then((content) => {
        if (cancelled) return;
        setText(
          content.length > 50000 ? `${content.slice(0, 50000)}\n\n[File truncated for preview]` : content
        );
      })
      .catch(() => {
        if (!cancelled) setText('Unable to preview file content.');
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item, isText]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), UNMOUNT_DELAY);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, video, audio, iframe, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === 'ArrowRight' && hasNext && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, onPrevious, onNext, hasPrevious, hasNext]);

  const startSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, a, input, textarea, select, video, audio, iframe, .preview-bar')) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  };

  const finishSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length === 0) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.at;
    if (elapsed > 800 || Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.15) return;

    // A swipe can synthesize a mousedown on the backdrop. Keep that from
    // dismissing the preview after the file has changed.
    swipeConsumed.current = true;
    window.clearTimeout(swipeResetTimer.current);
    swipeResetTimer.current = window.setTimeout(() => {
      swipeConsumed.current = false;
    }, 450);

    if (dx < 0) {
      if (hasNext && onNext) onNext();
    } else if (hasPrevious && onPrevious) {
      onPrevious();
    }
  };

  const cancelSwipe = () => {
    touchStart.current = null;
  };

  if (!mounted || !item) return null;

  const previewUrl = api.previewUrl(item.id);
  // The versioned image URL skips previews cached at the old 2000 px cap.
  const imagePreviewUrl = `${previewUrl}?v=3`;
  const isPdf = item.mimeType === 'application/pdf';
  const name = displayName(item.originalName);
  const canGoPrevious = Boolean(hasPrevious && onPrevious);
  const canGoNext = Boolean(hasNext && onNext);

  return (
    <div
      className={`preview-overlay ${open ? 'active' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onMouseDown={(event) => {
        if (swipeConsumed.current) {
          swipeConsumed.current = false;
          return;
        }
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchStart={startSwipe}
      onTouchEnd={finishSwipe}
      onTouchCancel={cancelSwipe}
      style={tint ? ({ '--preview-tint': tint } as CSSProperties) : undefined}
    >
      <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
        <Icon name="x" className="icon icon-sm" />
      </button>

      {canGoPrevious || canGoNext ? (
        <>
          <button
            type="button"
            className="preview-nav preview-nav-prev"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label="Previous file"
            title="Previous file"
          >
            <Icon name="chevron-right" className="icon icon-sm" />
          </button>
          <button
            type="button"
            className="preview-nav preview-nav-next"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next file"
            title="Next file"
          >
            <Icon name="chevron-right" className="icon icon-sm" />
          </button>
        </>
      ) : null}

      <div className="preview-canvas">
        {item.category === 'image' ? (
          <div
            className={`preview-image-wrap ${imageError ? 'is-error' : imageReady ? 'is-ready' : 'is-loading'}`}
            aria-busy={!imageReady}
          >
            <img
              key={`thumb-${item.id}`}
              src={api.thumbUrl(item.id)}
              className="preview-image preview-image-placeholder"
              alt=""
              aria-hidden="true"
              decoding="async"
              onLoad={(event) => {
                // The grid already loaded this thumb, so it gives the room its
                // colour while the full render is still on the server.
                const nextTint = readTint(event.currentTarget);
                if (nextTint) setTint((current) => current ?? nextTint);
              }}
            />
            {!imageError ? (
              <img
                key={item.id}
                src={imagePreviewUrl}
                className={`preview-image preview-image-full ${imageReady ? 'is-ready' : ''}`}
                alt={item.originalName}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onLoad={(event) => {
                  setImageReady(true);
                  setTint(readTint(event.currentTarget));
                }}
                onError={() => {
                  setImageError(true);
                  setImageReady(true);
                }}
              />
            ) : null}
            {!imageReady ? (
              <div className="preview-image-loading" role="status">
                <span className="preview-spinner" aria-hidden="true" />
                <span>Loading image</span>
              </div>
            ) : null}
            {imageError ? (
              <div className="preview-image-error" role="status">
                <FileTypeIcon
                  name={item.originalName}
                  category={item.category}
                  className="preview-file-icon"
                />
                <div className="preview-image-error-title">Preview unavailable</div>
                <div className="preview-image-error-hint">
                  Use the download button below to open the full file.
                </div>
              </div>
            ) : null}
          </div>
        ) : item.category === 'video' ? (
          <video key={item.id} controls autoPlay playsInline className="preview-video">
            <source src={previewUrl} type={item.mimeType} />
            Preview not supported in this browser
          </video>
        ) : item.category === 'audio' ? (
          <audio key={item.id} controls autoPlay className="preview-audio">
            <source src={previewUrl} type={item.mimeType} />
            Audio preview not supported in this browser
          </audio>
        ) : isPdf ? (
          canEmbedPdfInline() ? (
            <iframe key={item.id} src={previewUrl} title={item.originalName} className="preview-pdf" />
          ) : (
            <div className="preview-fallback">
              <FileTypeIcon name={item.originalName} category={item.category} className="preview-file-icon" />
              <a className="btn btn-primary" href={previewUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </div>
          )
        ) : isText ? (
          loadingText ? (
            <div className="preview-code-wrap">
              <PreviewSkeleton />
            </div>
          ) : (
            <div className="preview-code-wrap">{text}</div>
          )
        ) : (
          <div className="preview-fallback">
            <FileTypeIcon name={item.originalName} category={item.category} className="preview-file-icon" />
            <div className="preview-fallback-text">Inline preview not available for this file type</div>
          </div>
        )}
      </div>

      <div className="preview-bar">
        <a
          className="preview-download"
          href={api.downloadUrl(item.id)}
          download
          title="Download"
          aria-label={`Download ${name}`}
        >
          <Icon name="download" className="icon icon-sm" />
        </a>
        <span className="preview-filename" title={item.originalName}>
          {name}
        </span>
        {isPdf ? (
          <a className="preview-open-link" href={previewUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        ) : null}
      </div>
    </div>
  );
}
