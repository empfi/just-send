import { useState } from 'react';
import { api, type AuthorizationResult } from '../../api';
import type { Notify } from '../../types';
import { defaultDeviceName } from '../../utils';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  notify: Notify;
  onClose: () => void;
  onAuthorized: (result: AuthorizationResult) => void;
}

export function RecoverSheet({ open, notify, onClose, onAuthorized }: Props) {
  const [phrase, setPhrase] = useState('');
  const [device, setDevice] = useState(defaultDeviceName());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!phrase.trim()) {
      notify('Enter your 12-word recovery phrase', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.recoverWorkspace(phrase.trim(), device.trim() || 'Restored Device');
      if (res.success && res.data) {
        onAuthorized(res.data);
        setPhrase('');
      } else {
        notify(res.error ?? 'Invalid recovery phrase', 'error');
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recover workspace"
      icon="edit"
      footer={
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          <span>{busy ? 'Restoring...' : 'Restore workspace'}</span>
        </button>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Enter the 12-word recovery phrase for the workspace you want to restore on this device.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>12-word seed phrase</label>
        <textarea
          className="clip-textarea"
          style={{ minHeight: 70 }}
          placeholder="word1 word2 word3 ..."
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Name this device</label>
        <input
          type="text"
          className="search-input"
          placeholder="e.g. My Phone, Office PC"
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        />
      </div>
    </Sheet>
  );
}
