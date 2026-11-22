import { useEffect, useState } from 'react';
import { api, type AuthorizationResult } from '../../api';
import type { Notify, PairingInfo } from '../../types';
import { defaultDeviceName } from '../../utils';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  workspaceId: string | null;
  notify: Notify;
  onClose: () => void;
  onAuthorized: (result: AuthorizationResult) => void;
}

export function PairSheet({ open, workspaceId, notify, onClose, onAuthorized }: Props) {
  const [tab, setTab] = useState<'share' | 'enter'>('share');
  const [info, setInfo] = useState<PairingInfo | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [code, setCode] = useState('');
  const [device, setDevice] = useState(defaultDeviceName());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('share');
      setCode('');
      setInfo(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'share' || !workspaceId) return undefined;
    let cancelled = false;
    api.getPairingInfo(workspaceId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setInfo(res.data);
        setSeconds(res.data.secondsRemaining);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tab, workspaceId, refreshKey]);

  useEffect(() => {
    if (!open || tab !== 'share') return undefined;
    const id = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(id);
  }, [open, tab]);

  useEffect(() => {
    if (open && tab === 'share' && seconds <= 0) setRefreshKey((key) => key + 1);
  }, [open, tab, seconds]);

  const submit = async () => {
    if (code.trim().length !== 6) {
      notify('Please enter the 6-digit code', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.authorizeWithCode(workspaceId, code.trim(), device.trim() || defaultDeviceName());
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
      title="Authorize device"
      icon="smartphone"
    >
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          background: 'var(--bg-deep)',
          padding: 2,
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border-hairline)',
        }}
      >
        <button
          className={`tab-btn ${tab === 'share' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => setTab('share')}
        >
          <span>Share access</span>
        </button>
        <button
          className={`tab-btn ${tab === 'enter' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => setTab('enter')}
        >
          <span>Enter code</span>
        </button>
      </div>

      {tab === 'share' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', marginTop: 4 }}>
          <div className="qr-card">
            {info?.qrCode ? <img className="qr-img" src={info.qrCode} alt="Scan to authorize" /> : null}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Or enter this 30-second code on your other device:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div className="rotating-code-display tabular">{info?.code ?? '------'}</div>
            <div className="code-timer-badge tabular">{Math.max(0, seconds)}s</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rotates automatically every 30 seconds</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Enter the 6-digit code shown on your authorized device to permit this device to access the
            workspace.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              6-digit authorization code
            </label>
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
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>This device's name</label>
            <input
              type="text"
              className="search-input"
              placeholder="e.g. iPhone, Work Laptop"
              value={device}
              onChange={(event) => setDevice(event.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={submit} disabled={busy}>
            <span>{busy ? 'Authorizing...' : 'Authorize this device'}</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}
