import { invoke } from "@tauri-apps/api/core";
import type {
  Category,
  ClipboardItem,
  PaginatedItems,
  SearchParams,
  SourceApp,
} from "./types";
import type { AppSettings } from "./settings";

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke("save_settings", { settings });
}

export async function authenticatePrivacyReveal(): Promise<boolean> {
  return invoke("authenticate_privacy_reveal");
}

export async function setNotchExpanded(expanded: boolean): Promise<void> {
  return invoke("set_notch_expanded", { expanded });
}

export async function setNotchHoverPreview(hovered: boolean): Promise<void> {
  return invoke("set_notch_hover_preview", { hovered });
}

export async function openLibraryWindow(): Promise<void> {
  return invoke("open_library_window");
}

export async function getAppIcon(appName: string): Promise<string | null> {
  return invoke<string | null>("get_app_icon", { appName });
}

export async function listItems(params: SearchParams): Promise<PaginatedItems> {
  return invoke("list_items", { params });
}

export async function getRecent(limit = 10): Promise<ClipboardItem[]> {
  return invoke("get_recent", { limit });
}

export async function getContextualRecent(limit = 10): Promise<ClipboardItem[]> {
  return invoke("get_contextual_recent", { limit });
}

export async function listRecentDownloads(limit = 12): Promise<ClipboardItem[]> {
  return invoke("list_recent_downloads", { limit });
}

export async function deleteItem(id: string): Promise<void> {
  return invoke("delete_item", { id });
}

export async function deleteItems(ids: string[]): Promise<number> {
  return invoke("delete_items", { ids });
}

export async function clearHistory(): Promise<number> {
  return invoke("clear_history");
}

export async function seedDemoData(): Promise<number> {
  const inserted = await invoke<number>("seed_demo_data");
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail: inserted > 0 ? `Added ${inserted} demo clips` : "Demo clips already added",
    }),
  );
  return inserted;
}

export async function toggleFavorite(id: string): Promise<boolean> {
  return invoke("toggle_favorite", { id });
}

export async function setItemsFavorite(ids: string[], favorite: boolean): Promise<number> {
  return invoke("set_items_favorite", { ids, favorite });
}

export async function setItemsPinned(ids: string[], pinned: boolean): Promise<number> {
  return invoke("set_items_pinned", { ids, pinned });
}

export async function setPinShortcut(id: string, shortcut: number | null): Promise<void> {
  return invoke("set_pin_shortcut", { id, shortcut });
}

export async function setItemCategory(
  itemId: string,
  categoryId: number,
): Promise<void> {
  return invoke("set_item_category", { itemId, categoryId });
}

export async function listCategories(): Promise<Category[]> {
  return invoke("list_categories");
}

export async function createCategory(name: string): Promise<Category> {
  return invoke("create_category", { name });
}

export async function renameCategory(id: number, name: string): Promise<void> {
  return invoke("rename_category", { id, name });
}

export async function deleteCategory(id: number): Promise<void> {
  return invoke("delete_category", { id });
}

export async function listSourceApps(): Promise<SourceApp[]> {
  return invoke("list_source_apps");
}

export async function copyItemToClipboard(id: string, message?: string): Promise<void> {
  try {
    await invoke("copy_item_to_clipboard", { id });
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail:
          typeof error === "string" && error.includes("Sensitive item locked")
            ? "Unlock required to copy sensitive item"
            : "Copy failed",
      }),
    );
    return;
  }
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail: message ?? "Copied to clipboard",
    }),
  );
}

export async function copyItemsToClipboard(ids: string[], message?: string): Promise<void> {
  let copiedCount = ids.length;
  try {
    copiedCount = await invoke<number>("copy_items_to_clipboard", { ids });
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail:
          typeof error === "string" && error.includes("Sensitive item locked")
            ? "Unlock required to copy sensitive items"
            : "Bulk copy failed",
      }),
    );
    return;
  }
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail:
        message ??
        (copiedCount === 1
          ? "Copied 1 clip"
          : `Copied ${copiedCount} clips as a group`),
    }),
  );
}

export async function copyDownloadToClipboard(path: string, message?: string): Promise<void> {
  try {
    await invoke("copy_download_to_clipboard", { path });
  } catch {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail: "Download copy failed",
      }),
    );
    return;
  }
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail: message ?? "Copied download",
    }),
  );
}

export async function copyDownloadPathsToClipboard(
  paths: string[],
  message?: string,
): Promise<void> {
  let copiedCount = paths.length;
  try {
    copiedCount = await invoke<number>("copy_download_paths_to_clipboard", { paths });
  } catch {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail: "Download copy failed",
      }),
    );
    return;
  }
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail:
        message ??
        (copiedCount === 1
          ? "Copied 1 download"
          : `Copied ${copiedCount} downloads`),
    }),
  );
}

export async function copyTextToClipboard(text: string, message?: string): Promise<void> {
  await invoke("copy_text_to_clipboard", { text });
  window.dispatchEvent(
    new CustomEvent("clipflow:clipboard-feedback", {
      detail: message ?? "Copied to clipboard",
    }),
  );
}

export async function pasteDownloadByPath(path: string): Promise<void> {
  try {
    await invoke("paste_download_by_path", { path });
  } catch {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail: "Download paste failed",
      }),
    );
  }
}

export async function pasteItemById(id: string): Promise<void> {
  try {
    await invoke("paste_item_by_id", { id });
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail:
          typeof error === "string" && error.includes("Sensitive item locked")
            ? "Unlock required to paste sensitive item"
            : "Paste failed",
      }),
    );
  }
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

export function itemTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: "Text",
    url: "Link",
    code: "Code",
    image: "Image",
    file: "File",
    color: "Color",
    bundle: "Bundle",
  };
  return labels[type] ?? type;
}

export function itemTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    text: "T",
    url: "🔗",
    code: "{ }",
    image: "🖼",
    file: "📄",
    color: "◼",
    bundle: "▦",
  };
  return icons[type] ?? "•";
}
