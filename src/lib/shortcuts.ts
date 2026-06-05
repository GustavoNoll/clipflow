import type { AppSettings } from "./settings";

export interface ShortcutItem {
  keys: string;
  label: string;
}

export function getShortcuts(settings: Pick<AppSettings, "defaultLauncher">): ShortcutItem[] {
  const launcherLabel =
    settings.defaultLauncher === "quick-paste"
      ? "Open quick paste"
      : "Open notch shelf";

  return [
    { keys: "⌃⌘V", label: launcherLabel },
    { keys: "⌃⇧⌘V", label: "Quick paste" },
    { keys: "⌃⌘0–9", label: "Paste recent item" },
    { keys: "⌘F", label: "Find in library" },
    { keys: "⌘,", label: "Settings" },
    { keys: "⌘⌃S", label: "Toggle sidebar" },
    { keys: "⌫", label: "Delete selected items" },
    { keys: "⎋", label: "Close panel / shelf" },
  ];
}

export const TRAY_HINT = "Use the ClipFlow menu bar for commands and shortcuts";
