import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ServerLogEntry } from '../../types';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
}

type LogFilter = 'all' | ServerLogEntry['level'];

const FILTERS: Array<{ key: LogFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'info', label: 'Info' },
  { key: 'success', label: 'Done' },
  { key: 'warn', label: 'Warnings' },
  { key: 'error', label: 'Errors' },
];

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function levelLabel(level: ServerLogEntry['level']): string {
  if (level === 'success') return 'done';
  if (level === 'warn') return 'warn';
  return level;
}

export function ServerLogsSheet({ open, onClose }: Props) {
  const [logs, setLogs] = useState<ServerLogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getServerLogs(200);
      if (res.success) {
        setLogs(res.data ?? []);
        setError(null);
      } else {
        setError(res.error ?? 'Could not load server logs');
      }
    } catch {
      setError('Could not load server logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const counts = {
    all: logs.length,
    info: logs.filter((entry) => entry.level === 'info').length,
    success: logs.filter((entry) => entry.level === 'success').length,
    warn: logs.filter((entry) => entry.level === 'warn').length,
    error: logs.filter((entry) => entry.level === 'error').length,
  };
  const visible = filter === 'all' ? logs : logs.filter((entry) => entry.level === filter);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Server logs"
      icon="code"
      large
      headerAction={
        <button
          className="btn btn-subtle btn-icon"
          type="button"
          title="Refresh logs"
          aria-label="Refresh logs"
          onClick={() => void load()}
        >
          <Icon name="layers" className="icon icon-sm" />
        </button>
      }
    >
      <div className="server-log-toolbar">
        <div className="server-log-filters" role="tablist" aria-label="Filter server logs">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`log-filter ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="log-filter-count tabular">{counts[key]}</span>
            </button>
          ))}
        </div>
        <span className="server-log-live">
          <span className="server-log-live-dot" />
          Live
        </span>
      </div>

      {error ? (
        <div className="panel-empty">{error}</div>
      ) : loading && logs.length === 0 ? (
        <div className="panel-empty">Loading server logs…</div>
      ) : visible.length === 0 ? (
        <div className="panel-empty">
          {logs.length === 0 ? 'No server activity yet.' : `No ${filter} entries.`}
        </div>
      ) : (
        <div className="server-logs-list" role="log">
          {visible.map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className={`server-log-row level-${entry.level}`}
              title={entry.at}
            >
              <span className={`server-log-level level-${entry.level}`}>{levelLabel(entry.level)}</span>
              <div className="server-log-main">
                <div className="server-log-message">{entry.message}</div>
                {entry.detail ? <div className="server-log-detail">{entry.detail}</div> : null}
              </div>
              <time className="server-log-time tabular" dateTime={entry.at}>
                {formatLogTime(entry.at)}
              </time>
            </div>
          ))}
        </div>
      )}

      <div className="server-log-foot">Last 200 entries · refreshes every 5 seconds</div>
    </Sheet>
  );
}
