import { getVersion } from "@tauri-apps/api/app";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  checkForUpdate,
  downloadInstallAndRelaunch,
  type AvailableUpdate,
} from "./updater";

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

function isTauriApp() {
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}

export function UpdateStatusProvider({ children }: { children: ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [status, setStatus] = useState("Not checked yet");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const checkNow = useCallback(async () => {
    if (!isTauriApp()) return;
    setChecking(true);
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
    }
  }, []);

  const installNow = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    void getVersion().then(setCurrentVersion).catch(() => undefined);
    const timer = window.setTimeout(() => {
      void checkNow();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkNow]);

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
