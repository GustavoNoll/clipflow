import type { ClipboardItem } from "./types";

export interface DateGroup {
  label: string;
  items: ClipboardItem[];
}

export function groupItemsByDate(items: ClipboardItem[]): DateGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const today: ClipboardItem[] = [];
  const yesterday: ClipboardItem[] = [];
  const older: ClipboardItem[] = [];

  for (const item of items) {
    const date = new Date(item.createdAt);
    if (date >= todayStart) {
      today.push(item);
    } else if (date >= yesterdayStart) {
      yesterday.push(item);
    } else {
      older.push(item);
    }
  }

  const groups: DateGroup[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (older.length) groups.push({ label: "Earlier", items: older });
  return groups;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateItemSize(item: ClipboardItem): string | null {
  if (item.itemType === "image" && item.thumbnail) {
    const b64 = item.thumbnail.split(",")[1];
    if (b64) {
      const bytes = Math.floor((b64.length * 3) / 4);
      return formatFileSize(bytes);
    }
  }
  if (item.itemType === "file") return null;
  return null;
}
