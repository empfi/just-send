import { useEffect, useState } from 'react';
import { api, type AuthorizationResult } from '../../api';
import type { Notify } from '../../types';
import { defaultDeviceName } from '../../utils';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  workspaceId: string;
  pairToken: string;
  notify: Notify;
  onClose: () => void;
  onAuthorized: (result: AuthorizationResult) => void;
}

export function QrScanSheet({ open, workspaceId, pairToken, notify, onClose, onAuthorized }: Props) {
  const [device, setDevice] = useState(defaultDeviceName());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDevice(defaultDeviceName());
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.authorizeWithQr(workspaceId, pairToken, device.trim() || 'Mobile Device');
      if (res.success && res.data) {
        onAuthorized(res.data);
      } else {
        notify(res.error ?? 'Authorization failed', 'error');
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
      title="Authorize new device"
      icon="smartphone"
      footer={
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          <span>{busy ? 'Authorizing...' : 'Join workspace'}</span>
        </button>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        You scanned an authorization link to join workspace:{' '}
        <strong style={{ color: 'var(--text-primary)' }}>{workspaceId.slice(0, 8)}...</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Name this device</label>
        <input
          type="text"
          className="search-input"
          placeholder="e.g. My iPhone, Tablet"
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        />
      </div>
    </Sheet>
  );
}
