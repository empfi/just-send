// Files multer is still writing, or that are being removed after an aborted
// request, must not be adopted by the disk sync as if someone had copied them in.
const activeUploads = new Set<string>();

export function trackActiveUpload(filePath: string): void {
  activeUploads.add(filePath);
}

export function untrackActiveUpload(filePath: string): void {
  activeUploads.delete(filePath);
}

export function isUploadActive(filePath: string): boolean {
  return activeUploads.has(filePath);
}
