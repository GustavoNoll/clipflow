import type { ClipboardItem } from "./types";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getItemByteSize(item: ClipboardItem): number {
  if (item.contentSize != null && item.contentSize > 0) {
    return item.contentSize;
  }
  if (item.itemType === "image" && item.thumbnail) {
    const b64 = item.thumbnail.split(",")[1];
    if (b64) return Math.floor((b64.length * 3) / 4);
  }
  return new TextEncoder().encode(item.content).length;
}

export function getItemSizeLabel(item: ClipboardItem): string {
  return formatFileSize(getItemByteSize(item));
}

export function getSourceAppLabel(item: ClipboardItem): string {
  return item.sourceApp?.trim() || "Unknown";
}
