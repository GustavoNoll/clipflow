import { Keyboard } from "lucide-react";
import { getShortcuts, getTrayHint, type ShortcutItem } from "../lib/shortcuts";
import type { AppSettings } from "../lib/settings";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";

interface ShortcutsReferenceProps {
  settings: Pick<
    AppSettings,
    "defaultLauncher" | "language" | "launcherShortcut" | "quickPasteShortcut"
  >;
  variant?: "compact" | "panel";
  className?: string;
}

export function ShortcutsReference({
  settings,
  variant = "panel",
  className,
}: ShortcutsReferenceProps) {
  const shortcuts = getShortcuts(settings);
  const { t } = useI18n();
  const trayHint = getTrayHint(settings.language);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5",
          className,
        )}
      >
        <p className="text-section mb-2 flex items-center gap-1.5 px-0.5">
          <Keyboard size={12} />
          {t("shortcuts")}
        </p>
        <ul className="space-y-1.5">
          {shortcuts.map((item) => (
            <ShortcutRow key={item.keys} item={item} size="sm" />
          ))}
        </ul>
        <p className="text-label mt-2 px-0.5 leading-snug">{trayHint}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {shortcuts.map((item) => (
        <ShortcutRow key={item.keys} item={item} size="md" />
      ))}
      <p className="text-label pt-1 leading-snug">{trayHint}</p>
    </div>
  );
}

function ShortcutRow({
  item,
  size,
}: {
  item: ShortcutItem;
  size: "sm" | "md";
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "truncate text-[var(--color-text-secondary)]",
          size === "sm" ? "text-[11px]" : "text-sm",
        )}
      >
        {item.label}
      </span>
      <kbd
        className={cn(
          "shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-hover)] font-mono text-[var(--color-text)]",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        )}
      >
        {item.keys}
      </kbd>
    </li>
  );
}
