import { useEffect, useRef, useState } from 'react';
import type { Tab, Workspace } from '../types';
import { Icon } from './Icon';

interface HeaderProps {
  workspaces: Workspace[];
  loading: boolean;
  currentWorkspaceId: string | null;
  hasWorkspaces: boolean;
  isMaster: boolean;
  tab: Tab;
  onSelectWorkspace: (id: string) => void;
  onTabChange: (tab: Tab) => void;
  onCreateWorkspace: () => void;
  onRecoverWorkspace: () => void;
  onPairDevice: () => void;
  onOpenDevices: () => void;
  onDeleteWorkspace: () => void;
}

export function Header({
  workspaces,
  loading,
  currentWorkspaceId,
  hasWorkspaces,
  isMaster,
  tab,
  onSelectWorkspace,
  onTabChange,
  onCreateWorkspace,
  onRecoverWorkspace,
  onPairDevice,
  onOpenDevices,
  onDeleteWorkspace,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  const current = workspaces.find((w) => w.id === currentWorkspaceId);
  const label = current ? current.name : hasWorkspaces ? 'Connect device' : 'Setup required';

  const closeThen = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <header className="app-header">
      <div className="header-container">
        <div className="header-left">
          <div className="workspace-selector-wrap" ref={wrapRef}>
            <button
              className="btn btn-secondary workspace-trigger-btn"
              onClick={() => setOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <Icon name="folder" className="icon icon-sm" />
              {loading ? (
                <span className="skeleton skeleton-line" style={{ width: 64 }} aria-label="Loading workspaces" />
              ) : (
                <span>{label}</span>
              )}
              <Icon name="chevron-down" className="icon icon-sm workspace-trigger-chevron" />
            </button>

            {open ? (
              <div className="workspace-dropdown-menu" role="menu">
                <div className="dropdown-header">Workspaces</div>
                <div className="workspace-list">
                  {workspaces.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 8px' }}>
                      No authorized workspaces
                    </div>
                  ) : (
                    workspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        className={`workspace-option ${workspace.id === currentWorkspaceId ? 'active' : ''}`}
                        onClick={() => closeThen(() => onSelectWorkspace(workspace.id))}
                        role="menuitem"
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {workspace.name}
                        </span>
                        <span className="ws-badge tabular">{workspace.deviceCount || 1} dev</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-action-btn" onClick={() => closeThen(onCreateWorkspace)}>
                  <Icon name="folder-plus" className="icon icon-sm" />
                  <span>Create workspace</span>
                </button>
                <button className="dropdown-action-btn" onClick={() => closeThen(onRecoverWorkspace)}>
                  <Icon name="edit" className="icon icon-sm" />
                  <span>Recover with phrase</span>
                </button>
                <button className="dropdown-action-btn" onClick={() => closeThen(onOpenDevices)}>
                  <Icon name="smartphone" className="icon icon-sm" />
                  <span>Devices &amp; audit</span>
                </button>
                <button className="dropdown-action-btn" onClick={() => closeThen(onPairDevice)}>
                  <Icon name="qrcode" className="icon icon-sm" />
                  <span>Authorize device / code</span>
                </button>
                {isMaster && current ? (
                  <>
                    <div className="dropdown-divider" />
                    <button
                      className="dropdown-action-btn dropdown-action-danger"
                      onClick={() => closeThen(onDeleteWorkspace)}
                    >
                      <Icon name="trash" className="icon icon-sm" />
                      <span>Delete workspace</span>
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="header-tabs">
          <button
            className={`tab-btn ${tab === 'files' ? 'active' : ''}`}
            onClick={() => onTabChange('files')}
          >
            <Icon name="file" className="icon icon-sm" />
            Files
          </button>
          <button
            className={`tab-btn ${tab === 'clips' ? 'active' : ''}`}
            onClick={() => onTabChange('clips')}
          >
            <Icon name="clipboard" className="icon icon-sm" />
            Text Drop
          </button>
        </div>

        <div className="header-right">
          <button
            className="btn btn-secondary header-pair-btn"
            onClick={onPairDevice}
            title="Connect another device"
          >
            <Icon name="qrcode" className="icon icon-sm" />
            <span>Connect</span>
          </button>
        </div>
      </div>
    </header>
  );
}
