import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { AuditEntry, DeviceInfo, Notify } from '../../types';
import { formatTimeAgo } from '../../utils';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  workspaceId: string | null;
  isMaster: boolean;
  notify: Notify;
  onClose: () => void;
}

const AUDIT_LABELS: Record<string, string> = {
  session_created: 'Session started',
  session_bad_signature: 'Bad device signature',
  session_replay_blocked: 'Replay blocked',
  session_fingerprint_rejected: 'Fingerprint rejected',
  session_stale_proof: 'Stale proof rejected',
  pairing_code_viewed: 'Pairing code viewed',
  device_paired_with_code: 'Device paired with code',
  device_paired_with_qr: 'Device paired with QR',
  device_revoked: 'Device revoked',
  device_upgraded_to_key: 'Device upgraded to key',
  workspace_created: 'Workspace created',
  workspace_recovered: 'Workspace recovered',
  master_action_denied: 'Master-only action denied',
};

function auditLabel(event: string): string {
  return AUDIT_LABELS[event] ?? event.replace(/_/g, ' ');
}

function relativeTime(value: string): string {
  const label = formatTimeAgo(value);
  return label === 'Just now' ? 'just now' : label;
}

export function DevicesSheet({ open, workspaceId, isMaster, notify, onClose }: Props) {
  const [tab, setTab] = useState<'devices' | 'audit'>('devices');
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (open) setTab('devices');
  }, [open]);

  useEffect(() => {
    if (!open || !workspaceId) return undefined;
    let cancelled = false;
    setLoading(true);
    api
      .getWorkspaceDevices(workspaceId)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setDevices(res.data ?? []);
        else notify(res.error ?? 'Could not load devices', 'error');
      })
      .catch(() => {
        if (!cancelled) notify('Could not load devices', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, refreshKey, notify]);

  useEffect(() => {
    if (!open || !workspaceId || !isMaster || tab !== 'audit') return undefined;
    let cancelled = false;
    setAuditLoading(true);
    api
      .getAuditLog(workspaceId)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setAudit(res.data ?? []);
        else notify(res.error ?? 'Could not load audit log', 'error');
      })
      .catch(() => {
        if (!cancelled) notify('Could not load audit log', 'error');
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, isMaster, tab, refreshKey, notify]);

  const currentDeviceId = workspaceId ? api.currentDeviceId(workspaceId) : null;

  const deviceName = (id?: string): string => {
    if (!id) return 'Unknown device';
    return devices.find((device) => device.id === id)?.name ?? `${id.slice(0, 8)}…`;
  };

  const revoke = async (device: DeviceInfo) => {
    if (!workspaceId) return;
    if (!window.confirm(`Revoke ${device.name}? Its active sessions will end immediately.`)) return;
    setRevoking(device.id);
    try {
      const res = await api.revokeDevice(workspaceId, device.id);
      if (res.success) {
        notify(`${device.name} revoked`, 'success');
        setRefreshKey((key) => key + 1);
      } else {
        notify(res.error ?? 'Could not revoke device', 'error');
      }
    } catch {
      notify('Could not revoke device', 'error');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Devices & access"
      icon="smartphone"
      large
      headerAction={
        <button
          className="btn btn-subtle btn-icon"
          title="Refresh"
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          <Icon name="layers" className="icon icon-sm" />
        </button>
      }
    >
      {isMaster ? (
        <div className="sheet-tabs">
          <button
            className={`tab-btn ${tab === 'devices' ? 'active' : ''}`}
            onClick={() => setTab('devices')}
          >
            <span>Devices</span>
          </button>
          <button
            className={`tab-btn ${tab === 'audit' ? 'active' : ''}`}
            onClick={() => setTab('audit')}
          >
            <span>Audit log</span>
          </button>
        </div>
      ) : (
        <div className="device-panel-note">
          <Icon name="lock" className="icon icon-sm" />
          <span>Only master devices can invite devices, revoke access, or view the audit log.</span>
        </div>
      )}

      {tab === 'devices' ? (
        loading ? (
          <div className="panel-empty">Loading devices…</div>
        ) : devices.length === 0 ? (
          <div className="panel-empty">No active devices.</div>
        ) : (
          <div className="device-list">
            {devices.map((device) => {
              const isSelf = device.id === currentDeviceId;
              return (
                <div key={device.id} className="device-row">
                  <div className={`device-avatar ${device.isMaster ? 'master' : ''}`}>
                    <Icon name={device.isMaster ? 'lock' : 'smartphone'} className="icon icon-sm" />
                  </div>
                  <div className="device-main">
                    <div className="device-name-row">
                      <span className="device-name">{device.name}</span>
                      {isSelf ? <span className="device-self-tag">This device</span> : null}
                    </div>
                    <div className="device-meta">
                      {device.isMaster ? 'Master' : 'Connector'} · Last seen{' '}
                      {relativeTime(device.lastSeenAt)} · Added {relativeTime(device.authorizedAt)}
                    </div>
                  </div>
                  {isMaster && !isSelf ? (
                    <button
                      className="btn btn-subtle btn-icon device-revoke"
                      title={`Revoke ${device.name}`}
                      disabled={revoking === device.id}
                      onClick={() => void revoke(device)}
                    >
                      <Icon name="trash" className="icon icon-sm" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : auditLoading ? (
        <div className="panel-empty">Loading audit log…</div>
      ) : audit.length === 0 ? (
        <div className="panel-empty">No audit entries yet.</div>
      ) : (
        <div className="audit-list">
          {audit.map((entry, index) => (
            <div key={`${entry.at}-${index}`} className="audit-row">
              <span className="audit-dot" />
              <div className="audit-main">
                <div className="audit-line">
                  <span className="audit-event">{auditLabel(entry.event)}</span>
                  <span className="audit-time">{formatTimeAgo(entry.at)}</span>
                </div>
                <div className="audit-meta">
                  {entry.deviceId ? deviceName(entry.deviceId) : 'System'}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                  {entry.detail ? ` · ${entry.detail}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
