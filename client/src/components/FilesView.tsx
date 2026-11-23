import { useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { Breadcrumb, Item } from '../types';
import { api } from '../api';
import { formatTimeAgo } from '../utils';
import { Icon } from './Icon';
import { FileTypeIcon } from './FileTypeIcon';
import { Checkbox } from './Checkbox';
import { FilesSkeleton } from './Skeletons';

export type ViewMode = 'grid' | 'list';

interface FilesViewProps {
  items: Item[];
  loading: boolean;
  canUpload: boolean;
  canManage: boolean;
  breadcrumbs: Breadcrumb[];
  folderId: string | null;
  sort: string;
  view: ViewMode;
  selected: Set<string>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onViewChange: (view: ViewMode) => void;
  onNavigate: (folderId: string | null) => void;
  onOpenPreview: (item: Item) => void;
  onDownload: (item: Item) => void;
  onRename: (item: Item) => void;
  onDelete: (item: Item) => void;
  onMove: (itemId: string, targetFolderId: string | null) => void;
  onSelect: (id: string, checked: boolean) => void;
  onSelectMany: (ids: string[], checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onCreateFolder: () => void;
  onBatchShare: () => void;
  onBatchDownload: () => void;
  onBatchDelete: () => void;
  onContextMenu: (event: ReactMouseEvent, item: Item | null) => void;
}

// Keeps typing local to the field so the file grid never re-renders per keystroke.
function SearchBox({ onSearchChange }: { onSearchChange: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  const sent = useRef('');

  useEffect(() => {
    if (draft === sent.current) return undefined;
    const timer = window.setTimeout(() => {
      sent.current = draft;
      onSearchChange(draft);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, onSearchChange]);

  const clear = () => {
    sent.current = '';
    setDraft('');
    onSearchChange('');
  };

  return (
    <div className="search-box">
      <Icon name="search" className="icon icon-sm search-icon" />
      <input
        type="text"
        id="searchInput"
        className="search-input"
        placeholder="Search all files"
        value={draft}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) => setDraft(event.target.value)}
      />
      <kbd className="search-keycap">/</kbd>
      {draft ? (
        <button className="search-clear visible" onClick={clear} aria-label="Clear search">
          <Icon name="x" className="icon icon-sm" />
        </button>
      ) : null}
    </div>
  );
}

export function FilesView(props: FilesViewProps) {
  const {
    items,
    loading,
    canUpload,
    canManage,
    breadcrumbs,
    folderId,
    sort,
    view,
    selected,
    onSearchChange,
    onSortChange,
    onViewChange,
    onNavigate,
    onOpenPreview,
    onDownload,
    onRename,
    onDelete,
    onMove,
    onSelect,
    onSelectMany,
    onSelectAll,
    onClearSelection,
    onCreateFolder,
    onBatchShare,
    onBatchDownload,
    onBatchDelete,
    onContextMenu,
  } = props;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const selectAnchor = useRef<string | null>(null);

  // Ctrl/Cmd toggles one item, Shift takes the range from the last clicked one.
  const handleSelectClick = (event: ReactMouseEvent, item: Item) => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) return;
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey && selectAnchor.current) {
      const ids = items.map((entry) => entry.id);
      const from = ids.indexOf(selectAnchor.current);
      const to = ids.indexOf(item.id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        onSelectMany(ids.slice(start, end + 1), true);
        return;
      }
    }

    onSelect(item.id, !selected.has(item.id));
    selectAnchor.current = item.id;
  };

  useEffect(() => {
    if (!newMenuOpen) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      if (!newMenuRef.current?.contains(event.target as Node)) setNewMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [newMenuOpen]);

  const startDrag = (event: ReactDragEvent, item: Item) => {
    setDraggingId(item.id);
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const dragOverFolder = (event: ReactDragEvent, targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(targetId);
  };

  const dropOn = (event: ReactDragEvent, targetId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (draggingId) onMove(draggingId, targetId);
    setDraggingId(null);
  };

  const crumbDropProps = (targetId: string | null) => ({
    onDragOver: (event: ReactDragEvent) => {
      if (!draggingId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(targetId ?? 'root');
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (event: ReactDragEvent) => dropOn(event, targetId),
  });

  const renderThumb = (item: Item) => {
    const folderImages = item.isFolder ? item.previewImageIds ?? [] : [];

    if (folderImages.length === 1) {
      return (
        <div className="thumb-single">
          <img
            src={api.thumbUrl(folderImages[0])}
            className="thumb-single-backdrop"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <img
            src={api.thumbUrl(folderImages[0])}
            className="thumb-single-image"
            alt={item.originalName}
            loading="lazy"
            decoding="async"
          />
        </div>
      );
    }

    if (folderImages.length > 0) {
      return (
        <div className="thumb-collage" data-count={folderImages.length}>
          {folderImages.map((id) => (
            <img key={id} src={api.thumbUrl(id)} className="thumb-img" alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      );
    }

    if (!item.isFolder && item.category === 'video') {
      return (
        <video
          src={`${api.previewUrl(item.id)}#t=0.1`}
          className="thumb-video"
          muted
          playsInline
          preload="metadata"
          aria-label={item.originalName}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            // Nudge browsers that show a black frame until the playhead moves.
            video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
          }}
        />
      );
    }

    if (!item.isFolder && item.category === 'image') {
      return (
        <img
          src={api.thumbUrl(item.id)}
          className="thumb-img"
          alt={item.originalName}
          loading="lazy"
          decoding="async"
        />
      );
    }

    return (
      <div className="thumb-icon-placeholder">
        {item.isFolder ? (
          <Icon name="folder" className="icon icon-lg" style={{ color: 'var(--text-primary)' }} />
        ) : (
          <FileTypeIcon name={item.originalName} category={item.category} />
        )}
      </div>
    );
  };

  const openItem = (item: Item) => {
    if (item.isFolder) onNavigate(item.id);
    else onOpenPreview(item);
  };

  return (
    <div id="filesView">
      <nav className="breadcrumbs-bar" aria-label="Breadcrumbs">
        <button
          className={`breadcrumb-item breadcrumb-home ${folderId ? '' : 'active'} ${
            dropTarget === 'root' ? 'drag-target-over' : ''
          }`}
          {...crumbDropProps(null)}
          onClick={() => onNavigate(null)}
        >
          <Icon name="hard-drive" className="icon icon-sm" />
          <span>Files</span>
        </button>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="breadcrumb-separator">
                <Icon name="chevron-right" className="icon icon-sm" />
              </span>
              <button
                {...crumbDropProps(crumb.id)}
                className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''} ${
                  dropTarget === crumb.id ? 'drag-target-over' : ''
                }`}
                onClick={() => onNavigate(crumb.id)}
              >
                <span>{crumb.name}</span>
              </button>
            </span>
          ))}
        </div>
      </nav>

      <section className="toolbar">
        <div className="toolbar-top">
          <SearchBox onSearchChange={onSearchChange} />

          <div className="view-controls">
            {canUpload ? (
              <div className="new-menu-wrap" ref={newMenuRef}>
                <button
                  className="btn btn-secondary"
                  title="Create new item"
                  style={{ height: 32, padding: '0 10px' }}
                  onClick={() => setNewMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={newMenuOpen}
                >
                  <svg className="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New</span>
                  <Icon name="chevron-down" className="icon icon-sm" />
                </button>
                {newMenuOpen ? (
                  <div className="new-menu" role="menu">
                    <button
                      className="new-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setNewMenuOpen(false);
                        onCreateFolder();
                      }}
                    >
                      <Icon name="folder-plus" className="icon icon-sm" />
                      <span>Folder</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="view-controls-right">
              <select
                id="sortSelect"
                className="select-input"
                value={sort}
                onChange={(event) => onSortChange(event.target.value)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="size-desc">Largest first</option>
                <option value="size-asc">Smallest first</option>
              </select>

              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', padding: 2, borderRadius: 'var(--radius-control)', border: '1px solid var(--border-hairline)' }}>
                <button
                  className={`btn ${view === 'grid' ? 'btn-secondary' : 'btn-subtle'} btn-icon`}
                  title="Grid view"
                  style={{ height: 26, width: 26 }}
                  onClick={() => onViewChange('grid')}
                >
                  <Icon name="grid" className="icon icon-sm" />
                </button>
                <button
                  className={`btn ${view === 'list' ? 'btn-secondary' : 'btn-subtle'} btn-icon`}
                  title="List view"
                  style={{ height: 26, width: 26 }}
                  onClick={() => onViewChange('list')}
                >
                  <Icon name="list" className="icon icon-sm" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <FilesSkeleton view={view} />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Icon name="folder" className="icon icon-lg" style={{ color: 'var(--text-muted)' }} />
          <div className="empty-state-title">This folder is empty</div>
          <div className="empty-state-desc">
            {canUpload
              ? 'Drop files here, choose files, or right-click to create a folder.'
              : 'Drop files in from a device with upload access.'}
          </div>
        </div>
      ) : view === 'grid' ? (
        <section className="files-grid" onContextMenu={(event) => onContextMenu(event, null)}>
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            const isFolder = item.isFolder;
            return (
              <div
                key={item.id}
                className={`file-card ${isSelected ? 'selected' : ''} ${isFolder ? 'folder-card' : ''} ${
                  dropTarget === item.id ? 'drag-target-over' : ''
                }`}
                data-id={item.id}
                draggable={canManage}
                onDragStart={(event) => startDrag(event, item)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                {...(isFolder
                  ? {
                      onDragOver: (event: ReactDragEvent) => dragOverFolder(event, item.id),
                      onDragLeave: () => setDropTarget(null),
                      onDrop: (event: ReactDragEvent) => dropOn(event, item.id),
                    }
                  : {})}
                onContextMenu={(event) => {
                  event.stopPropagation();
                  onContextMenu(event, item);
                }}
                onClickCapture={(event) => handleSelectClick(event, item)}
              >
                <div className="card-top">
                  <Checkbox
                    checked={isSelected}
                    onChange={(checked) => onSelect(item.id, checked)}
                    label={`Select ${item.originalName}`}
                    className="file-select-box"
                  />
                </div>

                <div className="card-preview-thumb" onClick={() => openItem(item)}>
                  {renderThumb(item)}
                </div>

                <div className="card-details">
                  <div className="card-title-row">
                    <div
                      className="card-filename"
                      title={item.originalName}
                      onClick={() => openItem(item)}
                    >
                      {item.originalName}
                    </div>
                    <span className="card-time tabular">{formatTimeAgo(item.uploadedAt)}</span>
                  </div>
                  {item.folderPath ? <div className="card-folder-path">{item.folderPath}</div> : null}
                  {isFolder ? null : (
                    <div className="card-meta tabular">
                      <span>{item.formattedSize}</span>
                    </div>
                  )}
                </div>

                <div className="card-actions">
                  <div className="card-actions-left">
                    {isFolder ? (
                      <button className="btn btn-subtle btn-icon" title="Open folder" onClick={() => onNavigate(item.id)}>
                        <Icon name="folder" className="icon icon-sm" />
                      </button>
                    ) : (
                      <button className="btn btn-subtle btn-icon" title="Preview file" onClick={() => onOpenPreview(item)}>
                        <Icon name="eye" className="icon icon-sm" />
                      </button>
                    )}
                    <button className="btn btn-subtle btn-icon" title={isFolder ? 'Download folder as ZIP' : 'Download file'} onClick={() => onDownload(item)}>
                      <Icon name="download" className="icon icon-sm" />
                    </button>
                    {canManage ? (
                      <button className="btn btn-subtle btn-icon" title="Rename" onClick={() => onRename(item)}>
                        <Icon name="edit" className="icon icon-sm" />
                      </button>
                    ) : null}
                  </div>
                  {canManage ? (
                    <button className="btn btn-subtle btn-icon" title="Delete" onClick={() => onDelete(item)}>
                      <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="files-list" onContextMenu={(event) => onContextMenu(event, null)}>
          <table className="files-list-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <Checkbox
                    checked={items.length > 0 && selected.size === items.length}
                    indeterminate={selected.size > 0 && selected.size < items.length}
                    onChange={onSelectAll}
                    label="Select all items"
                  />
                </th>
                <th>Name</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const isFolder = item.isFolder;
                return (
                  <tr
                    key={item.id}
                    className={`${isSelected ? 'selected' : ''} ${isFolder ? 'folder-row' : ''} ${
                      dropTarget === item.id ? 'drag-target-over' : ''
                    }`}
                    draggable={canManage}
                    onDragStart={(event) => startDrag(event, item)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTarget(null);
                    }}
                    {...(isFolder
                      ? {
                          onDragOver: (event: ReactDragEvent) => dragOverFolder(event, item.id),
                          onDragLeave: () => setDropTarget(null),
                          onDrop: (event: ReactDragEvent) => dropOn(event, item.id),
                        }
                      : {})}
                    onContextMenu={(event) => {
                      event.stopPropagation();
                      onContextMenu(event, item);
                    }}
                    onClickCapture={(event) => handleSelectClick(event, item)}
                  >
                    <td style={{ width: 36 }}>
                      <Checkbox
                        checked={isSelected}
                        onChange={(checked) => onSelect(item.id, checked)}
                        label={`Select ${item.originalName}`}
                        className="file-select-box"
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isFolder ? (
                          <Icon name="folder" className="icon icon-sm" style={{ color: 'var(--text-primary)' }} />
                        ) : (
                          <FileTypeIcon
                            name={item.originalName}
                            category={item.category}
                            className="file-type-icon-sm"
                          />
                        )}
                        <span onClick={() => openItem(item)} style={{ cursor: 'pointer' }}>
                          {item.originalName}
                        </span>
                        {item.folderPath ? <span className="card-folder-path">{item.folderPath}</span> : null}
                      </div>
                    </td>
                    <td className="tabular" style={{ color: 'var(--text-secondary)' }}>
                      {isFolder ? '' : item.formattedSize}
                    </td>
                    <td className="tabular" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(item.uploadedAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {isFolder ? (
                          <button className="btn btn-subtle btn-icon" title="Open folder" onClick={() => onNavigate(item.id)}>
                            <Icon name="folder" className="icon icon-sm" />
                          </button>
                        ) : (
                          <button className="btn btn-subtle btn-icon" title="Preview" onClick={() => onOpenPreview(item)}>
                            <Icon name="eye" className="icon icon-sm" />
                          </button>
                        )}
                        <button className="btn btn-subtle btn-icon" title={isFolder ? 'Download folder as ZIP' : 'Download file'} onClick={() => onDownload(item)}>
                          <Icon name="download" className="icon icon-sm" />
                        </button>
                        {canManage ? (
                          <button className="btn btn-subtle btn-icon" title="Delete" onClick={() => onDelete(item)}>
                            <Icon name="trash" className="icon icon-sm" style={{ color: 'var(--status-negative)' }} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {selected.size > 0 ? (
        <div className="batch-bar active" role="region" aria-label="Bulk actions">
          <div className="batch-info">
            <span className="batch-count tabular">
              {selected.size} item{selected.size === 1 ? '' : 's'} selected
            </span>
            <button className="batch-deselect" onClick={onClearSelection}>
              Deselect all
            </button>
          </div>
          <div className="batch-actions">
            {canManage ? (
              <button className="btn btn-primary" onClick={onBatchShare}>
                <Icon name="link" className="icon icon-sm" />
                Share
              </button>
            ) : null}
            <button className="btn btn-secondary" onClick={onBatchDownload}>
              <Icon name="download" className="icon icon-sm" />
              <span className="batch-action-label">Download ZIP</span>
            </button>
            {canManage ? (
              <button className="btn btn-danger" onClick={onBatchDelete}>
                <Icon name="trash" className="icon icon-sm" />
                <span className="batch-action-label">Delete</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
