import { useState } from 'react';
import type { Clip } from '../types';
import { copyText, formatTimeAgo } from '../utils';
import { Icon } from './Icon';
import { ClipsSkeleton } from './Skeletons';

interface ClipsViewProps {
  clips: Clip[];
  loading: boolean;
  onAdd: (content: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onCopied: (ok: boolean) => void;
}

export function ClipsView({ clips, loading, onAdd, onDelete, onCopied }: ClipsViewProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!value.trim() || sending) return;
    setSending(true);
    const ok = await onAdd(value.trim());
    if (ok) setValue('');
    setSending(false);
  };

  return (
    <div id="clipsView" className="clips-view active">
      <div className="clip-composer">
        <div style={{ fontWeight: 500, fontSize: 13 }}>Shared clipboard</div>
        <textarea
          className="clip-textarea"
          placeholder="Type or paste text, links, or notes to share with connected devices"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="clip-composer-footer">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Syncs instantly across local devices</span>
          <button className="btn btn-primary" onClick={submit} disabled={sending}>
            <Icon name="send" className="icon icon-sm" />
            <span>Send to network</span>
          </button>
        </div>
      </div>

      {loading ? (
        <ClipsSkeleton />
      ) : clips.length === 0 ? (
        <div className="empty-state">
          <Icon name="clipboard" className="icon icon-lg" style={{ color: 'var(--text-muted)' }} />
          <div className="empty-state-title">No shared snippets</div>
          <div className="empty-state-desc">
            Paste text, links, or notes to instantly share them across devices on your local network.
          </div>
        </div>
      ) : (
        <div className="clips-grid">
          {clips.map((clip) => (
            <div className="clip-card" key={clip.id}>
              <div className="clip-content">{clip.content}</div>
              <div className="clip-footer">
                <span>
                  {clip.sender || 'Device'} · {formatTimeAgo(clip.createdAt)}
                </span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    className="btn btn-secondary btn-icon"
                    title="Copy text"
                    style={{ height: 26, width: 26 }}
                    onClick={async () => onCopied(await copyText(clip.content))}
                  >
                    <Icon name="copy" className="icon icon-sm" />
                  </button>
                  <button
                    className="btn btn-subtle btn-icon"
                    title="Delete snippet"
                    style={{ height: 26, width: 26 }}
                    onClick={() => onDelete(clip.id)}
                  >
                    <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
