import type { Notify } from '../../types';
import { copyText } from '../../utils';
import { Sheet } from '../Sheet';

interface Props {
  open: boolean;
  keyphrase: string;
  notify: Notify;
  onClose: () => void;
}

export function KeyphraseSheet({ open, keyphrase, notify, onClose }: Props) {
  const words = keyphrase ? keyphrase.split(' ') : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Master recovery phrase"
      icon="document"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          <span>I have saved my phrase</span>
        </button>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--status-positive)', fontWeight: 500 }}>
        Workspace created and cryptographic keys generated.
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Save this 12-word recovery phrase. If you switch devices or clear browser storage, you can use these
        words to restore full access.
      </div>

      <div className="keyphrase-grid">
        {words.map((word, index) => (
          <div className="keyphrase-word" key={`${word}-${index}`}>
            <span className="keyphrase-num">{index + 1}.</span>
            <span>{word}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-secondary"
          style={{ height: 28, fontSize: 11 }}
          onClick={async () => notify((await copyText(keyphrase)) ? 'Recovery phrase copied' : 'Unable to copy', 'success')}
        >
          Copy phrase
        </button>
      </div>
    </Sheet>
  );
}
