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
      <section className="clip-composer" aria-label="Shared clipboard">
        <div className="clip-composer-top">
          <div className="clip-composer-title">
            <Icon name="clipboard" className="icon icon-sm" />
            <span>Shared clipboard</span>
          </div>
          <span className="clip-composer-meta">Visible to connected devices</span>
        </div>
        <textarea
          className="clip-textarea"
          placeholder="Paste text, links, or notes to share..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
        />
        <div className="clip-composer-footer">
          <button className="btn btn-primary" onClick={submit} disabled={sending}>
            <Icon name="send" className="icon icon-sm" />
            <span>{sending ? 'Sending...' : 'Send'}</span>
          </button>
        </div>
      </section>

      {loading ? (
        <ClipsSkeleton />
      ) : clips.length === 0 ? (
        <div className="clips-empty">
          <div className="clips-empty-icon">
            <Icon name="clipboard" className="icon icon-sm" />
          </div>
          <div>
            <div className="clips-empty-title">No shared snippets yet</div>
            <div className="clips-empty-desc">
              Text you send above appears here and on every connected device.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="clips-section-header">
            <span>Snippets</span>
            <span className="clips-count tabular">{clips.length}</span>
          </div>
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
        </>
      )}
    </div>
  );
}
