import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check({ timeout: 20_000 });
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  };
}

export async function downloadInstallAndRelaunch(
  onProgress: (progress: number | null, label: string) => void,
) {
  const update = await check({ timeout: 20_000 });
  if (!update) {
    onProgress(null, "No update available");
    return false;
  }

  let downloaded = 0;
  let contentLength = 0;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloaded = 0;
      contentLength = event.data.contentLength ?? 0;
      onProgress(contentLength > 0 ? 0 : null, "Downloading update…");
      return;
    }

    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      const progress = contentLength > 0 ? downloaded / contentLength : null;
      onProgress(progress, "Downloading update…");
      return;
    }

    onProgress(1, "Installing update…");
  });

  onProgress(1, "Restarting ClipFlow…");
  await relaunch();
  return true;
}
