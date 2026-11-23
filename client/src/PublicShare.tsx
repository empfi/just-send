import { useCallback, useEffect, useState } from 'react';
import type { PublicShare as PublicShareData, PublicShareFile } from './types';
import { FileTypeIcon } from './components/FileTypeIcon';
import { Icon } from './components/Icon';
import { IconSprite } from './components/IconSprite';

interface Props {
  token: string;
}

const DEFAULT_NAME = 'Just Send';

function previewUrl(token: string, id: string): string {
  return `/api/public/shares/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}/preview`;
}

function downloadUrl(token: string, id: string): string {
  return `/api/public/shares/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}/download`;
}

function canPreview(file: PublicShareFile): boolean {
  if (file.category === 'image' || file.category === 'video' || file.category === 'audio') return true;
  if (file.mimeType === 'application/pdf') return true;
  return file.category === 'code' || file.mimeType.startsWith('text/');
}

function expiryLabel(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PublicSharePage({ token }: Props) {
  const [share, setShare] = useState<PublicShareData | null>(null);
  const [instanceName, setInstanceName] = useState(DEFAULT_NAME);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [gone, setGone] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PublicShareFile | null>(null);
  const [previewText, setPreviewText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/public/shares/${encodeURIComponent(token)}`, {
        credentials: 'same-origin',
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: PublicShareData;
        error?: string;
        requiresPassword?: boolean;
      };
      if (res.ok && json.data) {
        setShare(json.data);
        setLocked(false);
        setGone(false);
      } else if (res.status === 401 && json.requiresPassword) {
        setLocked(true);
      } else if (res.status === 410) {
        setGone(true);
      } else {
        setError(json.error ?? 'This link cannot be opened.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/api/system/config', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { name?: string; logoUrl?: string | null; accentColor?: string } } | null) => {
        if (json?.data?.name) setInstanceName(json.data.name);
        if (json?.data?.logoUrl) setLogoUrl(json.data.logoUrl);
        if (json?.data?.accentColor) {
          document.documentElement.style.setProperty('--accent', json.data.accentColor);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (share) document.title = `Shared files | ${instanceName}`;
  }, [share, instanceName]);

  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview]);

  useEffect(() => {
    setPreviewText('');
    if (!preview) return undefined;
    const isText = preview.category === 'code' || preview.mimeType.startsWith('text/');
    if (!isText) return undefined;
    let cancelled = false;
    fetch(previewUrl(token, preview.id), { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.text() : 'Unable to preview this file.'))
      .then((text) => {
        if (!cancelled) setPreviewText(text.slice(0, 20000));
      })
      .catch(() => {
        if (!cancelled) setPreviewText('Unable to preview this file.');
      });
    return () => {
      cancelled = true;
    };
  }, [preview, token]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/public/shares/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: PublicShareData; error?: string };
      if (res.ok && json.data) {
        setShare(json.data);
        setLocked(false);
        setPassword('');
      } else {
        setError(json.error ?? 'Incorrect password.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const limitReached =
    share?.maxDownloads !== null && share !== null && share.downloadCount >= (share.maxDownloads ?? 0);
  const downloadAllHref = `/api/public/shares/${encodeURIComponent(token)}/download`;

  return (
    <div className="public-page">
      <IconSprite />

      <header className="public-header">
        <div className="public-brand">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="public-brand-logo" />
          ) : (
            <span className="public-brand-mark">
              <Icon name="link" className="icon icon-sm" />
            </span>
          )}
          <span className="public-brand-name">{instanceName}</span>
        </div>
        {share ? (
          <span className="public-expiry tabular">Link expires {expiryLabel(share.expiresAt)}</span>
        ) : null}
      </header>

      <main className="public-main">
        {loading ? (
          <div className="public-card public-state">Opening link...</div>
        ) : gone ? (
          <div className="public-card public-state">
            <div className="public-state-title">This link is no longer active</div>
            <div className="public-state-desc">It may have expired or been revoked by the sender.</div>
          </div>
        ) : locked ? (
          <form className="public-card public-locked" onSubmit={unlock}>
            <div className="public-locked-icon">
              <Icon name="lock" className="icon" />
            </div>
            <div className="public-state-title">Password required</div>
            <div className="public-state-desc">The sender protected these files with a password.</div>
            <input
              type="password"
              className="search-input"
              placeholder="Password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <div className="public-error">{error}</div> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Checking...' : 'Open files'}
            </button>
          </form>
        ) : share ? (
          <div className="public-card">
            <div className="public-card-head">
              <div>
                <div className="public-card-title">
                  {share.files.length} file{share.files.length === 1 ? '' : 's'} shared with you
                </div>
                <div className="public-card-sub">
                  {share.allowDownload
                    ? share.maxDownloads
                      ? `${Math.max(0, share.maxDownloads - share.downloadCount)} of ${share.maxDownloads} downloads left`
                      : 'Downloads allowed'
                    : 'View only, downloads are disabled'}
                </div>
              </div>
              {share.allowDownload && !limitReached ? (
                <a className="btn btn-primary" href={downloadAllHref}>
                  <Icon name="download" className="icon icon-sm" />
                  <span>Download all</span>
                </a>
              ) : null}
            </div>

            {limitReached ? (
              <div className="public-error">This link reached its download limit.</div>
            ) : null}
            {error ? <div className="public-error">{error}</div> : null}

            <ul className="public-files">
              {share.files.map((file) => (
                <li key={file.id} className="public-file">
                  <FileTypeIcon
                    name={file.name}
                    category={file.category}
                    className="file-type-icon-sm public-file-icon"
                  />
                  <div className="public-file-text">
                    <span className="public-file-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="public-file-meta tabular">{file.formattedSize}</span>
                  </div>
                  <div className="public-file-actions">
                    {canPreview(file) ? (
                      <button
                        className="btn btn-subtle btn-icon"
                        title="Preview"
                        onClick={() => setPreview(file)}
                      >
                        <Icon name="eye" className="icon icon-sm" />
                      </button>
                    ) : null}
                    {share.allowDownload && !limitReached ? (
                      <a
                        className="btn btn-subtle btn-icon"
                        title="Download"
                        href={downloadUrl(token, file.id)}
                        download={file.name}
                      >
                        <Icon name="download" className="icon icon-sm" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="public-card public-state">
            <div className="public-state-title">Link unavailable</div>
            <div className="public-state-desc">{error || 'This link cannot be opened.'}</div>
          </div>
        )}
      </main>

      {preview ? (
        <div className="public-preview" onClick={() => setPreview(null)}>
          <div className="public-preview-window" onClick={(event) => event.stopPropagation()}>
            <div className="public-preview-head">
              <span className="public-preview-title">{preview.name}</span>
              <button className="btn btn-subtle btn-icon" onClick={() => setPreview(null)} aria-label="Close preview">
                <Icon name="x" className="icon icon-sm" />
              </button>
            </div>
            <div className="public-preview-body">
              {preview.category === 'image' ? (
                <img src={previewUrl(token, preview.id)} alt={preview.name} className="preview-image" />
              ) : preview.category === 'video' ? (
                <video controls autoPlay playsInline className="preview-video">
                  <source src={previewUrl(token, preview.id)} type={preview.mimeType} />
                </video>
              ) : preview.category === 'audio' ? (
                <audio controls autoPlay style={{ width: '100%' }}>
                  <source src={previewUrl(token, preview.id)} type={preview.mimeType} />
                </audio>
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewUrl(token, preview.id)}
                  title={preview.name}
                  className="public-preview-pdf"
                />
              ) : (
                <div className="preview-code-wrap">{previewText || 'Loading...'}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
