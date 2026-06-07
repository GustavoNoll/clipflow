import { AppIcon } from "./app-icon";
import { formatRelativeTimeForLanguage } from "../lib/i18n";
import { getItemSizeLabel, getSourceAppLabel } from "../lib/item-meta";
import { useSettings } from "../lib/settings-context";
import type { ClipboardItem } from "../lib/types";
import { cn } from "../lib/utils";

interface ItemMetaFooterProps {
  item: ClipboardItem;
  className?: string;
  compact?: boolean;
  variant?: "dark" | "light";
}

/** App badge + time on the left, file size on the right — always shown. */
export function ItemMetaFooter({
  item,
  className,
  compact,
  variant = "dark",
}: ItemMetaFooterProps) {
  const { settings } = useSettings();
  const isLight = variant === "light";
  const appLabel = getSourceAppLabel(item);
  const sizeLabel = getItemSizeLabel(item);
  const timeLabel = formatRelativeTimeForLanguage(item.createdAt, settings.language);

  return (
    <footer
      className={cn(
        "flex items-center justify-between gap-2 border-t px-2.5 py-2",
        isLight ? "border-black/[0.05]" : "border-white/[0.04]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <AppIcon
          appName={item.sourceApp}
          size={compact ? "xs" : "sm"}
          title={appLabel}
        />
        <span
          className={cn(
            "truncate",
            isLight ? "text-zinc-500" : "text-zinc-500",
            compact ? "text-[10px]" : "text-[11px]",
          )}
          title={`${appLabel} · ${timeLabel} · ${sizeLabel}`}
        >
          <span className={isLight ? "text-zinc-600" : "text-zinc-400"}>
            {appLabel}
          </span>
          <span className={isLight ? "text-zinc-400" : "text-zinc-600"}>
            {" "}
            ·{" "}
          </span>
          {timeLabel}
        </span>
      </div>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          isLight ? "text-zinc-400" : "text-zinc-500",
          compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        {sizeLabel}
      </span>
    </footer>
  );
}
