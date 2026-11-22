import type { Tab } from '../types';
import { Icon } from './Icon';

interface MobileDockProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onUpload: () => void;
  onConnect: () => void;
}

export function MobileDock({ tab, onTabChange, onUpload, onConnect }: MobileDockProps) {
  return (
    <aside className="mobile-bottom-dock">
      <button
        className={`mobile-nav-btn ${tab === 'files' ? 'active' : ''}`}
        onClick={() => onTabChange('files')}
      >
        <Icon name="file" />
        <span>Files</span>
      </button>
      <button
        className={`mobile-nav-btn ${tab === 'clips' ? 'active' : ''}`}
        onClick={() => onTabChange('clips')}
      >
        <Icon name="clipboard" />
        <span>Clipboard</span>
      </button>
      <button className="mobile-upload-btn" onClick={onUpload} title="Upload files">
        <Icon name="upload" />
      </button>
      <button className="mobile-nav-btn" onClick={onConnect} title="Connect device">
        <Icon name="qrcode" />
        <span>Connect</span>
      </button>
    </aside>
  );
}
