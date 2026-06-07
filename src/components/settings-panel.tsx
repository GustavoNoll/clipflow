import { X } from "lucide-react";
import { authenticatePrivacyReveal, seedDemoData } from "../lib/api";
import { LANGUAGE_OPTIONS, useI18n } from "../lib/i18n";
import { ACCENT_PRESETS } from "../lib/settings";
import { useSettings } from "../lib/settings-context";
import { useUpdateStatus } from "../lib/update-status-context";
import { ShortcutsReference } from "./shortcuts-reference";
import { cn } from "../lib/utils";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { t } = useI18n();
  const {
    currentVersion,
    update,
    status: updateStatus,
    progress: updateProgress,
    checking: checkingUpdate,
    installing: installingUpdate,
    checkNow,
    installNow,
  } = useUpdateStatus();
  const pauseUntilLabel = settings.capturePausedUntil
    ? new Date(settings.capturePausedUntil * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  function pauseFor(minutes: number) {
    const until = Math.floor(Date.now() / 1000) + minutes * 60;
    void updateSettings({ capturePaused: true, capturePausedUntil: until });
  }

  function resumeCapture() {
    void updateSettings({ capturePaused: false, capturePausedUntil: null });
  }

  function updateIgnoredApps(value: string) {
    const ignoredSourceApps = value
      .split(",")
      .map((app) => app.trim())
      .filter(Boolean);
    void updateSettings({ ignoredSourceApps });
  }

  async function toggleSensitivePreviews() {
    if (!settings.hideSensitiveContent) {
      await updateSettings({ hideSensitiveContent: true });
      return;
    }

    const authenticated = await authenticatePrivacyReveal();
    if (authenticated) {
      await updateSettings({ hideSensitiveContent: false });
      window.dispatchEvent(
        new CustomEvent("clipflow:clipboard-feedback", {
          detail: t("sensitivePreviewsRevealed"),
        }),
      );
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t("closeSettings")}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <aside
        className="glass-shell fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col rounded-l-[18px]"
        role="dialog"
        aria-label={t("settings")}
      >
        <header className="glass-toolbar flex items-center justify-between border-b px-5 py-4 pt-10">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {t("settings")}
            </h2>
            <p className="text-label mt-0.5">
              ClipFlow {currentVersion ? `v${currentVersion}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost h-8 w-8 p-0">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <Section title={t("appearance")}>
            <Field label={t("language")}>
              <Segmented
                value={settings.language}
                options={LANGUAGE_OPTIONS.map((language) => ({
                  value: language.value,
                  label: language.nativeName,
                }))}
                onChange={(v) =>
                  updateSettings({
                    language: v as typeof settings.language,
                    hasSelectedLanguage: true,
                  })
                }
              />
            </Field>
            <Field label={t("theme")}>
              <Segmented
                value={settings.theme}
                options={[
                  { value: "dark", label: t("dark") },
                  { value: "light", label: t("light") },
                ]}
                onChange={(v) =>
                  updateSettings({ theme: v as "dark" | "light" })
                }
              />
            </Field>
            <Field label={t("accentColor")}>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => updateSettings({ accent: preset.value })}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-105",
                      settings.accent === preset.value
                        ? "border-[var(--color-text)] scale-105"
                        : "border-transparent",
                    )}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>
            </Field>
          </Section>

          <Section title={t("behavior")}>
            <ToggleRow
              label={t("autoPaste")}
              description={t("autoPasteDescription")}
              checked={settings.autoPaste}
              onChange={(v) => updateSettings({ autoPaste: v })}
            />
            <ToggleRow
              label={t("pauseCapture")}
              description={t("pauseCaptureDescription")}
              checked={settings.capturePaused}
              onChange={(v) =>
                updateSettings({
                  capturePaused: v,
                  capturePausedUntil: v ? settings.capturePausedUntil : null,
                })
              }
            />
            <Field label={t("pauseTemporarily")}>
              <div className="grid grid-cols-3 gap-2">
                {[5, 15, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => pauseFor(minutes)}
                    className="btn-ghost border border-[var(--color-border-subtle)]"
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
              {settings.capturePaused && (
                <button
                  type="button"
                  onClick={resumeCapture}
                  className="btn-ghost mt-2 w-full text-[var(--color-success)]"
                >
                  {pauseUntilLabel ? t("resumeBefore", { time: pauseUntilLabel }) : t("resumeCapture")}
                </button>
              )}
            </Field>
            <ToggleRow
              label={t("notchShelf")}
              description={t("notchShelfDescription")}
              checked={settings.notchHoverEnabled}
              onChange={(v) => updateSettings({ notchHoverEnabled: v })}
            />
            <Field label={t("defaultLauncher")}>
              <Segmented
                value={settings.defaultLauncher}
                options={[
                  { value: "notch", label: t("notchShelf") },
                  { value: "quick-paste", label: t("quickPaste") },
                ]}
                onChange={(v) =>
                  updateSettings({
                    defaultLauncher: v as "notch" | "quick-paste",
                  })
                }
              />
            </Field>
          </Section>

          <Section title={t("privacy")}>
            <ToggleRow
              label={t("hideSensitivePreviews")}
              description={t("hideSensitivePreviewsDescription")}
              checked={settings.hideSensitiveContent}
              onChange={(v) => {
                if (v) {
                  void updateSettings({ hideSensitiveContent: true });
                } else {
                  void toggleSensitivePreviews();
                }
              }}
            />
            <Field label={t("sensitivePreviewAccess")}>
              <button
                type="button"
                onClick={() => {
                  void toggleSensitivePreviews();
                }}
                className="btn-ghost w-full border border-[var(--color-border-subtle)]"
              >
                {settings.hideSensitiveContent
                  ? t("revealSensitive")
                  : t("lockSensitive")}
              </button>
              <p className="text-label mt-1.5 leading-snug">
                {t("revealAuthDescription")}
              </p>
            </Field>
            <ToggleRow
              label={t("neverSaveSecrets")}
              description={t("neverSaveSecretsDescription")}
              checked={settings.skipSensitiveContent}
              onChange={(v) => updateSettings({ skipSensitiveContent: v })}
            />
            <Field label={t("ignoreApps")}>
              <textarea
                value={settings.ignoredSourceApps.join(", ")}
                onChange={(event) => updateIgnoredApps(event.target.value)}
                placeholder="1Password, Keychain Access, Terminal"
                className="input-field min-h-20 resize-none"
              />
              <p className="text-label mt-1.5 leading-snug">
                {t("ignoreAppsDescription")}
              </p>
            </Field>
          </Section>

          <Section title={t("keyboardShortcuts")}>
            <Field label={t("launcherShortcut")}>
              <input
                value={settings.launcherShortcut}
                onChange={(event) =>
                  updateSettings({ launcherShortcut: event.target.value })
                }
                className="input-field font-mono text-xs"
              />
            </Field>
            <Field label={t("quickPasteShortcut")}>
              <input
                value={settings.quickPasteShortcut}
                onChange={(event) =>
                  updateSettings({ quickPasteShortcut: event.target.value })
                }
                className="input-field font-mono text-xs"
              />
              <p className="text-label mt-1.5 leading-snug">
                {t("shortcutFormatHint")}
              </p>
            </Field>
            <ShortcutsReference settings={settings} variant="panel" />
          </Section>

          <Section title={t("library")}>
            <ToggleRow
              label={t("compactGrid")}
              description={t("compactGridDescription")}
              checked={settings.compactGrid}
              onChange={(v) => updateSettings({ compactGrid: v })}
            />
          </Section>

          <Section title={t("data")}>
            <Field label={t("updates")}>
              <div
                className={cn(
                  "glass-menu rounded-[var(--radius-lg)] p-3",
                  update
                    ? "border-amber-400/40 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
                    : "border-[var(--color-border-subtle)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {t("automaticUpdates")}
                      </p>
                      {update && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                          {t("updateAvailable")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      {currentVersion ? t("currentVersion", { version: currentVersion }) : ""}
                      {updateStatus}
                    </p>
                    {update?.body && (
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {update.body}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void checkNow();
                      }}
                      disabled={checkingUpdate || installingUpdate}
                      className="btn-ghost border border-[var(--color-border-subtle)] disabled:opacity-50"
                    >
                      {checkingUpdate ? t("checking") : t("check")}
                    </button>
                    {update && (
                      <button
                        type="button"
                        onClick={() => {
                          void installNow();
                        }}
                        disabled={installingUpdate}
                        className="btn-primary disabled:opacity-50"
                      >
                        {installingUpdate ? t("installing") : t("install")}
                      </button>
                    )}
                  </div>
                </div>
                {updateProgress !== null && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-border-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                      style={{ width: `${Math.max(0, Math.min(updateProgress, 1)) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <p className="text-label mt-1.5 leading-snug">
                {t("updateEndpointDescription")}
              </p>
            </Field>
            <Field label={t("demoContent")}>
              <button
                type="button"
                onClick={() => {
                  void seedDemoData();
                }}
                className="btn-ghost w-full border border-[var(--color-border-subtle)]"
              >
                {t("addDemoClips")}
              </button>
              <p className="text-label mt-1.5 leading-snug">
                {t("addDemoContentDescription")}
              </p>
            </Field>
            <Field label={t("historyLimit")}>
              <select
                value={settings.historyLimit}
                onChange={(e) =>
                  updateSettings({ historyLimit: Number(e.target.value) })
                }
                className="input-field"
              >
                <option value={0}>{t("unlimited")}</option>
                <option value={1000}>1,000 items</option>
                <option value={5000}>5,000 items</option>
                <option value={10000}>10,000 items</option>
                <option value={100000}>100,000 items</option>
              </select>
            </Field>
          </Section>
        </div>

        <footer className="border-t border-[var(--color-border-subtle)] px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
            <span>ClipFlow {currentVersion ? `v${currentVersion}` : ""}</span>
            <span className={update ? "font-medium text-amber-500" : ""}>
              {update ? t("versionAvailable", { version: update.version }) : updateStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={() => resetSettings()}
            className="btn-ghost w-full"
          >
            {t("resetDefaults")}
          </button>
        </footer>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="text-section mb-3">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-label mb-2">{label}</p>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-[var(--color-accent)] text-white"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
        <p className="text-label mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
