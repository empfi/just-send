import os from 'os';
import QRCode from 'qrcode';

export interface NetworkAddress {
  interface: string;
  address: string;
}

const VIRTUAL_INTERFACE = /(virtual|vethernet|hyper-v|wsl|vbox|docker|vmware|tailscale|zerotier|loopback|tunnel|\btap\b|\bppp\b)/i;

function isLanAddress(address: NetworkAddress): boolean {
  return (
    !VIRTUAL_INTERFACE.test(address.interface) &&
    !address.address.startsWith('169.254.') &&
    address.address !== '0.0.0.0'
  );
}

export function getNetworkAddresses(): NetworkAddress[] {
  const interfaces = os.networkInterfaces();
  const addresses: NetworkAddress[] = [];

  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          interface: interfaceName,
          address: iface.address,
        });
      }
    }
  }

  const lanAddresses = addresses.filter(isLanAddress);
  return lanAddresses.length > 0 ? lanAddresses : addresses;
}

export function getPrimaryLanIp(): string {
  const addrs = getNetworkAddresses();
  const preferred =
    addrs.find((a) => /wi-?fi|wlan|wireless/i.test(a.interface)) ??
    addrs.find((a) => /ethernet/i.test(a.interface)) ??
    addrs[0];
  return preferred?.address ?? '127.0.0.1';
}

export async function generateQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch {
    return null;
  }
}

export async function generateAsciiQr(url: string): Promise<string | null> {
  try {
    return await QRCode.toString(url, {
      type: 'terminal',
      small: true,
    });
  } catch {
    return null;
  }
}
