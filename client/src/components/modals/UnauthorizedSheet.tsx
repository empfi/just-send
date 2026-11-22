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
  onCreateWorkspace: () => void;
  onRecover: () => void;
  dismissible?: boolean;
}

export function UnauthorizedSheet({
  open,
  notify,
  onClose,
  onAuthorized,
  onCreateWorkspace,
  onRecover,
  dismissible = true,
}: Props) {
  const [code, setCode] = useState('');
  const [device, setDevice] = useState(defaultDeviceName());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.trim().length !== 6) {
      notify('Please enter the 6-digit code', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.authorizeWithCode(null, code.trim(), device.trim() || defaultDeviceName());
      if (res.success && res.data) {
        setCode('');
        onAuthorized(res.data);
      } else {
        notify(res.error ?? 'Invalid code', 'error');
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
      title="Connect this device"
      icon="lock"
      dismissible={dismissible}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        This device is not authorized for any workspace yet. Enter the 6-digit code shown on your authorized
        device, or create a new workspace.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>6-digit pairing code</label>
        <input
          type="text"
          className="search-input tabular"
          maxLength={6}
          placeholder="000000"
          style={{ fontSize: 20, letterSpacing: '0.25em', textAlign: 'center', fontWeight: 600 }}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Device name</label>
        <input
          type="text"
          className="search-input"
          placeholder="e.g. iPhone, Work Laptop"
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        />
      </div>

      <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={submit} disabled={busy}>
        <span>{busy ? 'Connecting...' : 'Connect with code'}</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCreateWorkspace}>
          <span>New workspace</span>
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onRecover}>
          <span>Recover phrase</span>
        </button>
      </div>
    </Sheet>
  );
}
