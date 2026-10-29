// Hands the browser a file to save, the way every export does it: a
// throwaway <a download> clicked once.
export function downloadURL(url: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadURL(url, filename);
  URL.revokeObjectURL(url);
}
