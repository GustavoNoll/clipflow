export interface AppSettings {
  language: "en" | "pt" | "es";
  hasSelectedLanguage: boolean;
  theme: "dark" | "light";
  accent: string;
  autoPaste: boolean;
  capturePaused: boolean;
  defaultLauncher: "notch" | "quick-paste";
  compactGrid: boolean;
  showSourceApp: boolean;
  historyLimit: number;
  notchHoverEnabled: boolean;
  capturePausedUntil?: number | null;
  ignoredSourceApps: string[];
  hideSensitiveContent: boolean;
  skipSensitiveContent: boolean;
  hasCompletedOnboarding: boolean;
  launcherShortcut: string;
  quickPasteShortcut: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  hasSelectedLanguage: false,
  theme: "light",
  accent: "#5b5fc7",
  autoPaste: true,
  capturePaused: false,
  defaultLauncher: "notch",
  compactGrid: false,
  showSourceApp: true,
  historyLimit: 0,
  notchHoverEnabled: false,
  capturePausedUntil: null,
  ignoredSourceApps: [],
  hideSensitiveContent: true,
  skipSensitiveContent: false,
  hasCompletedOnboarding: false,
  launcherShortcut: "Control+Meta+KeyV",
  quickPasteShortcut: "Control+Shift+Meta+KeyV",
};

export const ACCENT_PRESETS = [
  { id: "indigo", label: "Indigo", value: "#5b5fc7" },
  { id: "blue", label: "Blue", value: "#0a84ff" },
  { id: "green", label: "Green", value: "#30b05a" },
  { id: "rose", label: "Rose", value: "#e5484d" },
  { id: "amber", label: "Amber", value: "#d97706" },
  { id: "violet", label: "Violet", value: "#8b5cf6" },
] as const;

export function applySettingsToDocument(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.setProperty("--color-accent", settings.accent);
  root.style.setProperty(
    "--color-accent-hover",
    settings.accent,
  );
  root.style.setProperty(
    "--color-accent-muted",
    `${settings.accent}22`,
  );
  root.style.setProperty(
    "--color-accent-subtle",
    `${settings.accent}14`,
  );
}
