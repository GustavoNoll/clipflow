import { getSourceAppLabel } from "./item-meta";
import type { ClipboardItem } from "./types";

const LEGACY_IMAGE_PREVIEW = /^\[Image (\d+)×(\d+)\]$/;
const GENERIC_FILE_NAMES = new Set(["clipboard-image.png"]);

/** Human-friendly label for clipboard items in lists and the notch peek. */
export function getItemDisplayLabel(
  item: ClipboardItem,
  compact = false,
): string {
  const fileName = item.fileName?.trim();
  if (fileName && !GENERIC_FILE_NAMES.has(fileName)) {
    return compact && fileName.length > 28
      ? `${fileName.slice(0, 28)}…`
      : fileName;
  }

  switch (item.itemType) {
    case "image": {
      const legacy = item.preview.match(LEGACY_IMAGE_PREVIEW);
      if (legacy) {
        return compact
          ? "Screenshot"
          : `Screenshot · ${legacy[1]}×${legacy[2]}`;
      }
      if (item.preview.startsWith("Screenshot")) {
        return compact ? "Screenshot" : item.preview;
      }
      return compact ? "Screenshot" : item.preview;
    }
    case "file": {
      const path = item.content.split("\n")[0]?.trim() || item.preview;
      const base = path.split("/").pop() || path;
      return compact && base.length > 28 ? `${base.slice(0, 28)}…` : base;
    }
    case "color":
      return item.content.trim();
    case "url": {
      try {
        const host = new URL(item.content.trim()).hostname.replace(/^www\./, "");
        return compact && host.length > 24 ? `${host.slice(0, 24)}…` : host;
      } catch {
        return item.preview;
      }
    }
    case "code":
      if (compact) return "Code snippet";
      return item.preview.split("\n")[0]?.trim() || "Code snippet";
    default: {
      const text = item.preview.trim();
      if (compact && text.length > 36) return `${text.slice(0, 36)}…`;
      return text;
    }
  }
}

/** Short subtitle for compact UI (e.g. notch peek with app context). */
export function getItemPeekLabel(item: ClipboardItem): string {
  const label = getItemDisplayLabel(item, true);
  const app = getSourceAppLabel(item);

  if (item.itemType === "image") {
    return app !== "Unknown" ? `${app} · Image` : label;
  }

  if (item.itemType === "file") {
    return app !== "Unknown" ? `${label} · ${app}` : label;
  }

  return label;
}
