import { getVersion } from "@tauri-apps/api/app";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkForUpdate,
  downloadInstallAndRelaunch,
  type AvailableUpdate,
} from "./updater";
import { translate } from "./i18n";
import { useSettings } from "./settings-context";

interface UpdateStatusContextValue {
  currentVersion: string | null;
  update: AvailableUpdate | null;
  status: string;
  checking: boolean;
  installing: boolean;
  progress: number | null;
  checkedAt: number | null;
  checkNow: () => Promise<void>;
  installNow: () => Promise<void>;
}

const UpdateStatusContext = createContext<UpdateStatusContextValue | null>(null);
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FOCUS_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const NOTIFIED_UPDATE_STORAGE_KEY = "clipflow.notifiedUpdateVersion";

function isTauriApp() {
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}

export function UpdateStatusProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [status, setStatus] = useState("Not checked yet");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const checkedAtRef = useRef<number | null>(null);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);

  const checkNow = useCallback(async () => {
    if (!isTauriApp()) return;
    setChecking(true);
    checkingRef.current = true;
    setProgress(null);
    setStatus("Checking for updates…");
    try {
      const [version, nextUpdate] = await Promise.all([
        getVersion(),
        checkForUpdate(),
      ]);
      setCurrentVersion(version);
      setUpdate(nextUpdate);
      setCheckedAt(Date.now());
      checkedAtRef.current = Date.now();
      setStatus(
        nextUpdate
          ? `Version ${nextUpdate.version} is available`
          : "ClipFlow is up to date",
      );
    } catch (error) {
      setUpdate(null);
      setStatus(
        error instanceof Error ? error.message : "Could not check for updates",
      );
    } finally {
      setChecking(false);
      checkingRef.current = false;
    }
  }, []);

  const checkSilently = useCallback(async () => {
    if (!isTauriApp() || checkingRef.current || installingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const [version, nextUpdate] = await Promise.all([
        getVersion(),
        checkForUpdate(),
      ]);
      setCurrentVersion(version);
      setUpdate(nextUpdate);
      const now = Date.now();
      setCheckedAt(now);
      checkedAtRef.current = now;
      setStatus(
        nextUpdate
          ? `Version ${nextUpdate.version} is available`
          : "ClipFlow is up to date",
      );

      if (nextUpdate) {
        const notifiedVersion = localStorage.getItem(NOTIFIED_UPDATE_STORAGE_KEY);
        if (notifiedVersion !== nextUpdate.version) {
          localStorage.setItem(NOTIFIED_UPDATE_STORAGE_KEY, nextUpdate.version);
          window.dispatchEvent(
            new CustomEvent("clipflow:clipboard-feedback", {
              detail: translate(settings.language, "updateReadyToast", {
                version: nextUpdate.version,
              }),
            }),
          );
        }
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not check for updates",
      );
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [settings.language]);

  const installNow = useCallback(async () => {
    installingRef.current = true;
    setInstalling(true);
    try {
      await downloadInstallAndRelaunch((nextProgress, label) => {
        setProgress(nextProgress);
        setStatus(label);
      });
    } catch (error) {
      setProgress(null);
      setStatus(
        error instanceof Error ? error.message : "Could not install update",
      );
      setInstalling(false);
      installingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    void getVersion().then(setCurrentVersion).catch(() => undefined);
    const timer = window.setTimeout(() => {
      void checkSilently();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkSilently]);

  useEffect(() => {
    if (!isTauriApp()) return;
    const interval = window.setInterval(() => {
      void checkSilently();
    }, AUTO_CHECK_INTERVAL_MS);

    function onFocus() {
      if (document.visibilityState === "hidden") return;
      const lastCheckedAt = checkedAtRef.current;
      if (lastCheckedAt && Date.now() - lastCheckedAt < FOCUS_CHECK_INTERVAL_MS) return;
      void checkSilently();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [checkSilently]);

  const value = useMemo(
    () => ({
      currentVersion,
      update,
      status,
      checking,
      installing,
      progress,
      checkedAt,
      checkNow,
      installNow,
    }),
    [
      currentVersion,
      update,
      status,
      checking,
      installing,
      progress,
      checkedAt,
      checkNow,
      installNow,
    ],
  );

  return (
    <UpdateStatusContext.Provider value={value}>
      {children}
    </UpdateStatusContext.Provider>
  );
}

export function useUpdateStatus() {
  const ctx = useContext(UpdateStatusContext);
  if (!ctx) {
    throw new Error("useUpdateStatus must be used within UpdateStatusProvider");
  }
  return ctx;
}
