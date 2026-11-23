export function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC';
  return 'Device';
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  if (navigator.clipboard && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0.01';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch {
  }

  try {
    window.prompt('Copy manually (Ctrl+C / Cmd+C):', text);
    return true;
  } catch {
    return false;
  }
}

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

// Invisible, control and private-use characters show up as empty boxes in the UI.
export function displayName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ue000-\uf8ff\ufff9-\ufffb]/g, '')
    .trim();
  return cleaned || name;
}

// Phone browsers show an empty frame for PDFs, so they get an open button instead.
export function canEmbedPdfInline(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return false;
  return true;
}
