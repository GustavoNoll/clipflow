import { X } from "lucide-react";
import { authenticatePrivacyReveal, seedDemoData } from "../lib/api";
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
          detail: "Sensitive previews revealed",
        }),
      );
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close settings"
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] shadow-[var(--shadow-popover)]"
        role="dialog"
        aria-label="Settings"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4 pt-10">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              Settings
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
          <Section title="Appearance">
            <Field label="Theme">
              <Segmented
                value={settings.theme}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
                onChange={(v) =>
                  updateSettings({ theme: v as "dark" | "light" })
                }
              />
            </Field>
            <Field label="Accent color">
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

          <Section title="Behavior">
            <ToggleRow
              label="Auto-paste on select"
              description="Paste automatically after choosing an item"
              checked={settings.autoPaste}
              onChange={(v) => updateSettings({ autoPaste: v })}
            />
            <ToggleRow
              label="Pause capture"
              description="Stop saving new clipboard items"
              checked={settings.capturePaused}
              onChange={(v) =>
                updateSettings({
                  capturePaused: v,
                  capturePausedUntil: v ? settings.capturePausedUntil : null,
                })
              }
            />
            <Field label="Pause temporarily">
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
                  Resume capture{pauseUntilLabel ? ` before ${pauseUntilLabel}` : ""}
                </button>
              )}
            </Field>
            <ToggleRow
              label="Notch shelf"
              description="Show the interactive shelf from the MacBook notch"
              checked={settings.notchHoverEnabled}
              onChange={(v) => updateSettings({ notchHoverEnabled: v })}
            />
            <Field label="Default launcher">
              <Segmented
                value={settings.defaultLauncher}
                options={[
                  { value: "notch", label: "Notch shelf" },
                  { value: "quick-paste", label: "Quick paste" },
                ]}
                onChange={(v) =>
                  updateSettings({
                    defaultLauncher: v as "notch" | "quick-paste",
                  })
                }
              />
            </Field>
          </Section>

          <Section title="Privacy">
            <ToggleRow
              label="Hide sensitive previews"
              description="Mask likely passwords, API keys, and tokens in cards"
              checked={settings.hideSensitiveContent}
              onChange={(v) => {
                if (v) {
                  void updateSettings({ hideSensitiveContent: true });
                } else {
                  void toggleSensitivePreviews();
                }
              }}
            />
            <Field label="Sensitive preview access">
              <button
                type="button"
                onClick={() => {
                  void toggleSensitivePreviews();
                }}
                className="btn-ghost w-full border border-[var(--color-border-subtle)]"
              >
                {settings.hideSensitiveContent
                  ? "Reveal with Touch ID or password"
                  : "Lock sensitive previews"}
              </button>
              <p className="text-label mt-1.5 leading-snug">
                Revealing previews requires macOS device-owner authentication.
              </p>
            </Field>
            <ToggleRow
              label="Never save secrets"
              description="Skip new clipboard text that looks like passwords, tokens, or API keys"
              checked={settings.skipSensitiveContent}
              onChange={(v) => updateSettings({ skipSensitiveContent: v })}
            />
            <Field label="Ignore apps">
              <textarea
                value={settings.ignoredSourceApps.join(", ")}
                onChange={(event) => updateIgnoredApps(event.target.value)}
                placeholder="1Password, Keychain Access, Terminal"
                className="input-field min-h-20 resize-none"
              />
              <p className="text-label mt-1.5 leading-snug">
                ClipFlow will skip new clipboard captures when the source app
                matches one of these names.
              </p>
            </Field>
          </Section>

          <Section title="Keyboard shortcuts">
            <ShortcutsReference settings={settings} variant="panel" />
          </Section>

          <Section title="Library">
            <ToggleRow
              label="Compact grid"
              description="Show more items per row"
              checked={settings.compactGrid}
              onChange={(v) => updateSettings({ compactGrid: v })}
            />
          </Section>

          <Section title="Data">
            <Field label="Updates">
              <div
                className={cn(
                  "rounded-[var(--radius-lg)] border bg-[var(--color-surface-raised)] p-3",
                  update
                    ? "border-amber-400/40 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
                    : "border-[var(--color-border-subtle)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Automatic updates
                      </p>
                      {update && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                          Update available
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      {currentVersion ? `Current v${currentVersion}. ` : ""}
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
                      {checkingUpdate ? "Checking…" : "Check"}
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
                        {installingUpdate ? "Installing…" : "Install"}
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
                Requires a signed release JSON at the configured update endpoint.
              </p>
            </Field>
            <Field label="Demo content">
              <button
                type="button"
                onClick={() => {
                  void seedDemoData();
                }}
                className="btn-ghost w-full border border-[var(--color-border-subtle)]"
              >
                Add demo clips
              </button>
              <p className="text-label mt-1.5 leading-snug">
                Adds realistic links, prompts, code, colors, and OCR-ready
                screenshots for demos or screen recordings.
              </p>
            </Field>
            <Field label="History limit">
              <select
                value={settings.historyLimit}
                onChange={(e) =>
                  updateSettings({ historyLimit: Number(e.target.value) })
                }
                className="input-field"
              >
                <option value={0}>Unlimited</option>
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
              {update ? `v${update.version} available` : updateStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={() => resetSettings()}
            className="btn-ghost w-full"
          >
            Reset to defaults
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
