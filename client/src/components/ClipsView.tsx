import { useState } from 'react';
import type { Clip } from '../types';
import { copyText, formatTimeAgo } from '../utils';
import { Icon } from './Icon';
import { ClipsSkeleton } from './Skeletons';
import { Sheet } from './Sheet';

interface ClipsViewProps {
  clips: Clip[];
  loading: boolean;
  canEdit: boolean;
  onAdd: (content: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onCopied: (ok: boolean) => void;
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
}

export function ClipsView({
  clips,
  loading,
  canEdit,
  onAdd,
  onDelete,
  onCopied,
  composerOpen,
  onComposerOpenChange,
}: ClipsViewProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!value.trim() || sending) return;
    setSending(true);
    const ok = await onAdd(value.trim());
    if (ok) {
      setValue('');
      onComposerOpenChange(false);
    }
    setSending(false);
  };

  return (
    <div id="clipsView" className="clips-view active">
      {loading ? (
        <ClipsSkeleton />
      ) : clips.length === 0 ? (
        <div className="empty-state">
          <Icon name="clipboard" className="icon icon-lg" style={{ color: 'var(--text-muted)' }} />
          <div className="empty-state-title">No shared snippets yet</div>
          <div className="empty-state-desc">
            Create a snippet to share text with every connected device.
          </div>
        </div>
      ) : (
        <>
          <div className="clips-section-header">
            <span>Snippets</span>
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
                    {canEdit ? (
                      <button
                        className="btn btn-subtle btn-icon"
                        title="Delete snippet"
                        style={{ height: 26, width: 26 }}
                        onClick={() => onDelete(clip.id)}
                      >
                        <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {canEdit ? (
        <button
          type="button"
          className="clip-fab"
          onClick={() => onComposerOpenChange(true)}
          aria-label="Create snippet"
          title="Create snippet"
        >
          <Icon name="send" className="icon" style={{ width: 20, height: 20 }} />
        </button>
      ) : null}

      <Sheet
        open={canEdit && composerOpen}
        onClose={() => onComposerOpenChange(false)}
        title="New snippet"
        icon="clipboard"
        footer={
          <button className="btn btn-primary" onClick={submit} disabled={sending || !value.trim()}>
            <span>{sending ? 'Sharing...' : 'Share'}</span>
          </button>
        }
      >
        <textarea
          className="clip-textarea"
          placeholder="Paste text, links, or notes to share..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={5}
          autoFocus
        />
      </Sheet>
    </div>
  );
}
