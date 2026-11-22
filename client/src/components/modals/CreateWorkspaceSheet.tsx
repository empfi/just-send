import { useEffect, useState } from 'react';
import { api, type CreateWorkspaceResult } from '../../api';
import type { Notify } from '../../types';
import { defaultDeviceName } from '../../utils';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  dismissible: boolean;
  notify: Notify;
  onClose: () => void;
  onCreated: (result: CreateWorkspaceResult) => void;
}

export function CreateWorkspaceSheet({ open, dismissible, notify, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [device, setDevice] = useState(defaultDeviceName());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDevice(defaultDeviceName());
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      notify('Please provide a workspace name', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createWorkspace(name.trim(), device.trim() || defaultDeviceName());
      if (res.success && res.data) {
        onCreated(res.data);
      } else {
        notify(res.error ?? 'Failed to create workspace', 'error');
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
      title="Create workspace"
      icon="folder-plus"
      dismissible={dismissible}
      footer={
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          <span>{busy ? 'Creating...' : 'Create workspace'}</span>
        </button>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Each workspace has its own isolated folder, encrypted shares, and cryptographic keypair.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Workspace name</label>
        <input
          type="text"
          className="search-input"
          placeholder="e.g. Personal, Studio, Team Project"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Current device name</label>
        <input
          type="text"
          className="search-input"
          placeholder="e.g. MacBook Pro, Studio PC, iPhone"
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        />
      </div>
    </Sheet>
  );
}
