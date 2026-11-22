import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Item } from '../../types';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { PreviewSkeleton } from '../Skeletons';

interface Props {
  open: boolean;
  item: Item | null;
  onClose: () => void;
}

export function PreviewSheet({ open, item, onClose }: Props) {
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [imageReady, setImageReady] = useState(false);

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

  if (!item) {
    return (
      <Sheet open={open} onClose={onClose} title="Preview" large showClose={false}>
        {null}
      </Sheet>
    );
  }

  const previewUrl = api.previewUrl(item.id);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item.originalName}
      large
      showClose={false}
      headerAction={
        <a
          className="btn btn-primary btn-icon"
          href={api.downloadUrl(item.id)}
          download
          title="Download"
          aria-label="Download"
        >
          <Icon name="download" className="icon icon-sm" />
        </a>
      }
    >
      <div className="preview-stage" style={{ padding: 0 }}>
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
          <div className="preview-audio-wrap">
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{item.originalName}</div>
            <audio controls autoPlay style={{ width: '100%', maxWidth: 360 }}>
              <source src={previewUrl} type={item.mimeType} />
              Audio preview not supported in this browser
            </audio>
          </div>
        ) : item.mimeType === 'application/pdf' ? (
          <iframe src={previewUrl} title={item.originalName} style={{ width: '100%', height: 460, border: 'none' }} />
        ) : isText ? (
          loadingText ? (
            <div className="preview-code-wrap">
              <PreviewSkeleton />
            </div>
          ) : (
            <div className="preview-code-wrap">{text}</div>
          )
        ) : (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{item.originalName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Inline preview not available for this file type
            </div>
            <a href={api.downloadUrl(item.id)} className="btn btn-secondary" download>
              Download file
            </a>
          </div>
        )}
      </div>

      <div
        className="tabular"
        style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}
      >
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Size:</span> {item.formattedSize}
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Type:</span> {item.mimeType}
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Uploaded:</span>{' '}
          {new Date(item.uploadedAt).toLocaleString()}
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Downloads:</span> {item.downloadCount || 0}
        </div>
      </div>
    </Sheet>
  );
}
