import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSettings, saveSettings as persistSettings } from "./api";
import {
  applySettingsToDocument,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "./settings";

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const remote = await getSettings();
    setSettings(remote);
    applySettingsToDocument(remote);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen<AppSettings>("settings:changed", (event) => {
      setSettings(event.payload);
      applySettingsToDocument(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    applySettingsToDocument(next);
    const saved = await persistSettings(next);
    setSettings(saved);
  }, [settings]);

  useEffect(() => {
    if (!settings.capturePausedUntil || !settings.capturePaused) return;
    const msUntilResume = settings.capturePausedUntil * 1000 - Date.now();
    if (msUntilResume <= 0) {
      void updateSettings({ capturePaused: false, capturePausedUntil: null });
      return;
    }
    const timer = setTimeout(() => {
      void updateSettings({ capturePaused: false, capturePausedUntil: null });
    }, msUntilResume);
    return () => clearTimeout(timer);
  }, [settings.capturePaused, settings.capturePausedUntil, updateSettings]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    applySettingsToDocument(DEFAULT_SETTINGS);
    const saved = await persistSettings(DEFAULT_SETTINGS);
    setSettings(saved);
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, loaded }),
    [settings, updateSettings, resetSettings, loaded],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
