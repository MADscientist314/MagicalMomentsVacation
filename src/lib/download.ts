/** Saves a file the browser already has (an HTML document, an image). */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Safari can cancel the download if the URL is revoked straight away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
