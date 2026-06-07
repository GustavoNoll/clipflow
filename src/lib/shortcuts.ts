import type { AppSettings } from "./settings";
import { translate } from "./i18n";

export interface ShortcutItem {
  keys: string;
  label: string;
}

export function formatShortcut(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => {
      const key = part.trim();
      if (key === "Control") return "⌃";
      if (key === "Shift") return "⇧";
      if (key === "Alt") return "⌥";
      if (key === "Meta") return "⌘";
      return key.replace(/^Key/, "").replace(/^Digit/, "");
    })
    .join("");
}

export function getShortcuts(
  settings: Pick<
    AppSettings,
    "defaultLauncher" | "language" | "launcherShortcut" | "quickPasteShortcut"
  >,
): ShortcutItem[] {
  const language = settings.language ?? "en";
  const launcherLabel =
    settings.defaultLauncher === "quick-paste"
      ? translate(language, "openQuickPaste")
      : translate(language, "openNotchShelf");

  return [
    { keys: formatShortcut(settings.launcherShortcut), label: launcherLabel },
    { keys: formatShortcut(settings.quickPasteShortcut), label: translate(language, "quickPaste") },
    { keys: "⌃⌘0–9", label: translate(language, "pasteRecentItem") },
    { keys: "⌃⌘0–9", label: translate(language, "pastePinnedItem") },
    { keys: "⌘F", label: translate(language, "findInLibrary") },
    { keys: "⌘,", label: translate(language, "settings") },
    { keys: "⌘⌃S", label: translate(language, "toggleSidebar") },
    { keys: "⌫", label: translate(language, "deleteSelectedItems") },
    { keys: "⎋", label: translate(language, "closePanelShelf") },
  ];
}

export function getTrayHint(language: AppSettings["language"]) {
  return translate(language ?? "en", "trayHint");
}
