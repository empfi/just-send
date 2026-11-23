import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { Notify, ShareSummary } from '../../types';
import { copyText } from '../../utils';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  itemIds: string[];
  notify: Notify;
  onClose: () => void;
}

const DURATIONS: Array<{ label: string; hours: number }> = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

function formatExpiry(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShareSheet({ open, itemIds, notify, onClose }: Props) {
  const [hours, setHours] = useState(24);
  const [customHours, setCustomHours] = useState('');
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ShareSummary | null>(null);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const res = await api.listShares();
      if (res.success) setShares(res.data ?? []);
    } catch {
      // the list is optional context, so a failure stays quiet
    } finally {
      setLoadingShares(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setHours(24);
    setCustomHours('');
    setPassword('');
    setMaxDownloads('');
    setAllowDownload(true);
    setCreated(null);
    setBusy(false);
    void loadShares();
  }, [open, loadShares]);

  const effectiveHours = customHours.trim() ? Number(customHours) : hours;

  const submit = async () => {
    if (!itemIds.length) {
      notify('Select files to share first', 'error');
      return;
    }
    if (!Number.isFinite(effectiveHours) || effectiveHours < 1 || effectiveHours > 168) {
      notify('Choose a duration between 1 hour and 7 days', 'error');
      return;
    }
    if (password && password.trim().length < 4) {
      notify('Use at least 4 characters for the password', 'error');
      return;
    }

    setBusy(true);
    try {
      const res = await api.createShare({
        itemIds,
        hours: Math.round(effectiveHours),
        password: password.trim() || undefined,
        maxDownloads: maxDownloads.trim() ? Number(maxDownloads) : null,
        allowDownload,
      });
      if (res.success && res.data) {
        setCreated(res.data);
        notify('Share link created', 'success');
        void loadShares();
      } else {
        notify(res.error ?? 'Could not create the link', 'error');
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      const res = await api.revokeShare(id);
      if (res.success) {
        setShares((current) => current.filter((share) => share.id !== id));
        setCreated((current) => (current && current.id === id ? null : current));
        notify('Link revoked', 'info');
      } else {
        notify(res.error ?? 'Could not revoke the link', 'error');
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setRevoking(null);
    }
  };

  const copyCreated = async () => {
    if (!created) return;
    const ok = await copyText(api.shareUrl(created.id));
    notify(ok ? 'Link copied' : 'Could not copy the link', ok ? 'success' : 'error');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share files"
      icon="link"
      footer={
        created ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <button className="btn btn-primary" onClick={submit} disabled={busy || !itemIds.length}>
            {busy ? 'Creating link...' : `Create link for ${itemIds.length} item${itemIds.length === 1 ? '' : 's'}`}
          </button>
        )
      }
    >
      {created ? (
        <div className="share-created">
          <div className="share-created-head">
            <span className="share-created-badge">
              <Icon name="check" className="icon icon-sm" />
            </span>
            <div>
              <div className="share-created-title">Your link is live</div>
              <div className="share-created-sub">
                {created.fileCount} file{created.fileCount === 1 ? '' : 's'}, expires {formatExpiry(created.expiresAt)}
                {created.passwordProtected ? ', password required' : ''}
              </div>
            </div>
          </div>
          <div className="share-link-row">
            <input className="search-input share-link-input" readOnly value={api.shareUrl(created.id)} />
            <button className="btn btn-secondary" onClick={copyCreated}>
              <Icon name="copy" className="icon icon-sm" />
              <span>Copy</span>
            </button>
          </div>
          <div className="share-created-actions">
            <a className="btn btn-subtle" href={api.shareUrl(created.id)} target="_blank" rel="noreferrer">
              Open link
            </a>
            <button
              className="btn btn-subtle text-danger"
              onClick={() => revoke(created.id)}
              disabled={revoking === created.id}
            >
              {revoking === created.id ? 'Revoking...' : 'Revoke link'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="share-field">
            <label className="share-label">Link expires after</label>
            <div className="share-chips">
              {DURATIONS.map((duration) => (
                <button
                  key={duration.hours}
                  className={`share-chip ${!customHours.trim() && hours === duration.hours ? 'active' : ''}`}
                  onClick={() => {
                    setHours(duration.hours);
                    setCustomHours('');
                  }}
                >
                  {duration.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={168}
              inputMode="numeric"
              className="search-input share-hours-input"
              placeholder="Or custom hours (max 168)"
              value={customHours}
              onChange={(event) => setCustomHours(event.target.value)}
            />
          </div>

          <div className="share-field">
            <label className="share-label">Password (optional)</label>
            <input
              type="password"
              className="search-input"
              placeholder="Leave empty for an open link"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="share-field">
            <label className="share-label">Download limit (optional)</label>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="search-input"
              placeholder="Unlimited"
              value={maxDownloads}
              onChange={(event) => setMaxDownloads(event.target.value)}
            />
          </div>

          <label className="share-toggle">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(event) => setAllowDownload(event.target.checked)}
            />
            <span className="share-toggle-text">
              <span className="share-toggle-title">Allow downloads</span>
              <span className="share-toggle-desc">
                Off means visitors can look at previews but the files cannot be saved.
              </span>
            </span>
          </label>
        </>
      )}

      <div className="share-existing">
        <div className="share-existing-head">
          <span>Active links</span>
          {loadingShares ? <span className="share-existing-loading">Loading...</span> : null}
        </div>
        {shares.length === 0 && !loadingShares ? (
          <div className="share-existing-empty">No active links in this workspace.</div>
        ) : (
          shares.map((share) => (
            <div key={share.id} className="share-existing-row">
              <div className="share-existing-info">
                <span className="share-existing-title">
                  {share.fileCount} file{share.fileCount === 1 ? '' : 's'}
                  {share.passwordProtected ? ' · password' : ''}
                  {!share.allowDownload ? ' · view only' : ''}
                </span>
                <span className="share-existing-sub">
                  Expires {formatExpiry(share.expiresAt)}
                  {share.maxDownloads ? ` · ${share.downloadCount}/${share.maxDownloads} downloads` : ''}
                </span>
              </div>
              <div className="share-existing-actions">
                <button
                  className="btn btn-subtle btn-icon"
                  title="Copy link"
                  onClick={async () => {
                    const ok = await copyText(api.shareUrl(share.id));
                    notify(ok ? 'Link copied' : 'Could not copy the link', ok ? 'success' : 'error');
                  }}
                >
                  <Icon name="copy" className="icon icon-sm" />
                </button>
                <button
                  className="btn btn-subtle btn-icon"
                  title="Revoke link"
                  disabled={revoking === share.id}
                  onClick={() => revoke(share.id)}
                >
                  <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}
