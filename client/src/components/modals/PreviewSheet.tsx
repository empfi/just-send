import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
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

export function PreviewSheet({ open, item, onClose }: Props) {
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [tint, setTint] = useState<string | null>(null);
  const [mounted, setMounted] = useState(open);

  const isText =
    !!item &&
    (item.category === 'code' ||
      item.mimeType.startsWith('text/') ||
      /\.(txt|json|md)$/i.test(item.originalName));

  useEffect(() => {
    setImageReady(false);
    setImageError(false);
    setTint(null);
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
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !item) return null;

  const previewUrl = api.previewUrl(item.id);
  // The versioned image URL skips previews cached at the old 2400 px cap.
  const imagePreviewUrl = `${previewUrl}?v=2`;
  const isPdf = item.mimeType === 'application/pdf';
  const name = displayName(item.originalName);

  return (
    <div
      className={`preview-overlay ${open ? 'active' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={tint ? ({ '--preview-tint': tint } as CSSProperties) : undefined}
    >
      <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
        <Icon name="x" className="icon icon-sm" />
      </button>

      <div className="preview-canvas">
        {item.category === 'image' ? (
          <div
            className={`preview-image-wrap ${imageError ? 'is-error' : imageReady ? 'is-ready' : 'is-loading'}`}
            aria-busy={!imageReady}
          >
            <img
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
          <video controls autoPlay playsInline className="preview-video">
            <source src={previewUrl} type={item.mimeType} />
            Preview not supported in this browser
          </video>
        ) : item.category === 'audio' ? (
          <audio controls autoPlay className="preview-audio">
            <source src={previewUrl} type={item.mimeType} />
            Audio preview not supported in this browser
          </audio>
        ) : isPdf ? (
          canEmbedPdfInline() ? (
            <iframe src={previewUrl} title={item.originalName} className="preview-pdf" />
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
