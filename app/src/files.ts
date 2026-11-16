// Getting a file out of the app: through the share sheet where there is one
// (so it can go to Files, Calendar or anywhere else), as a download otherwise.

/** Returns false only when the share sheet was opened and closed without choosing anywhere. */
export async function deliver(content: string | Uint8Array<ArrayBuffer>, name: string, type: string): Promise<boolean> {
  // iOS decides what can be shared by file type, and accepts plain text when it refuses other kinds of text.
  for (const candidate of typeof content === "string" ? [type, "text/plain"] : [type]) {
    const file = new File([content], name, { type: candidate });
    if (!navigator.canShare?.({ files: [file] })) continue;
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return false;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return true;
}
