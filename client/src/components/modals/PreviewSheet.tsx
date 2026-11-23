import { useEffect, useState } from 'react';
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

const UNMOUNT_DELAY = 200;

export function PreviewSheet({ open, item, onClose }: Props) {
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [mounted, setMounted] = useState(open);

  const isText =
    !!item &&
    (item.category === 'code' ||
      item.mimeType.startsWith('text/') ||
      /\.(txt|json|md)$/i.test(item.originalName));

  useEffect(() => {
    setImageReady(false);
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
    >
      <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
        <Icon name="x" className="icon icon-sm" />
      </button>

      <div className="preview-canvas">
        {item.category === 'image' ? (
          <div className="preview-image-wrap">
            <img
              src={previewUrl}
              className="preview-image"
              alt={item.originalName}
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(true)}
            />
            {!imageReady ? <div className="skeleton preview-image-skeleton" /> : null}
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
        <span className="preview-filename" title={item.originalName}>
          {name}
        </span>
        <a
          className="preview-download"
          href={api.downloadUrl(item.id)}
          download
          title="Download"
          aria-label={`Download ${name}`}
        >
          <Icon name="download" className="icon icon-sm" />
        </a>
        {isPdf ? (
          <a className="preview-open-link" href={previewUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        ) : null}
      </div>
    </div>
  );
}
