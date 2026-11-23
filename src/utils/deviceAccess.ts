import type { DeviceAccess, DeviceRecord } from '../types';

export const DEVICE_ACCESS_LEVELS: DeviceAccess[] = ['full', 'upload', 'view'];

export function isDeviceAccess(value: unknown): value is DeviceAccess {
  return typeof value === 'string' && (DEVICE_ACCESS_LEVELS as string[]).includes(value);
}

// Masters always keep full control. Older device records have no access field,
// which keeps them at full so existing installs do not lose permissions.
export function deviceAccess(device: DeviceRecord): DeviceAccess {
  if (device.isMaster) return 'full';
  return device.access ?? 'full';
}
