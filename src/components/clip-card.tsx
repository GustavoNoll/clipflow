import { useState } from "react";
import { AppIcon } from "./app-icon";
import { FileIcon, isDownloadFileItem } from "./file-icon";
import { getItemSizeLabel, getSourceAppLabel } from "../lib/item-meta";
import {
  formatRelativeTimeForLanguage,
  translateItemType,
  useI18n,
} from "../lib/i18n";
import { isSensitiveContent, privacyPreview } from "../lib/privacy";
import { useSettings } from "../lib/settings-context";
import { smartActionsForItem } from "../lib/smart-actions";
import type { ClipboardItem } from "../lib/types";
import { cn } from "../lib/utils";
import { Check, Keyboard, Pin, Star, Trash2 } from "lucide-react";
import { ContextMenu, type ContextMenuAction } from "./context-menu";

interface ClipCardProps {
  item: ClipboardItem;
  selected?: boolean;
  onFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onPaste?: (id: string) => void;
  onCopy?: (id: string) => void;
  onIgnoreApp?: (appName: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  onSetPinShortcut?: (id: string, shortcut: number | null) => void;
  onToggleSelect?: (id: string) => void;
}

export function ClipCard({
  item,
  selected,
  onFavorite,
  onDelete,
  onPaste,
  onCopy,
  onIgnoreApp,
  onPin,
  onSetPinShortcut,
  onToggleSelect,
}: ClipCardProps) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const isColor = item.itemType === "color";
  const colorValue = isColor ? item.content.trim() : undefined;
  const appLabel = getSourceAppLabel(item);
  const sizeLabel = getItemSizeLabel(item);
  const typeLabel = translateItemType(settings.language, item.itemType);
  const timeLabel = formatRelativeTimeForLanguage(item.createdAt, settings.language);
  const preview = privacyPreview(item.preview, settings.hideSensitiveContent);
  const isSensitiveLocked =
    settings.hideSensitiveContent && isSensitiveContent(item.preview);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const contextItems: ContextMenuAction[] = [
    {
      id: "paste",
      label: isSensitiveLocked ? t("unlockPaste") : t("paste"),
      onSelect: () => onPaste?.(item.id),
    },
    {
      id: "copy",
      label: isSensitiveLocked ? t("unlockCopy") : t("copyToClipboard"),
      onSelect: () => {
        onCopy?.(item.id);
      },
    },
    ...(isSensitiveLocked ? [] : smartActionsForItem(item).map((action) => ({
      id: action.id,
      label: action.label,
      onSelect: () => {
        void action.run();
      },
    }))),
    ...(onFavorite
      ? [{
          id: "favorite",
          label: item.isFavorite ? t("removeFavorite") : t("addFavorite"),
          onSelect: () => onFavorite(item.id),
        }]
      : []),
    ...(onPin
      ? [{
          id: "pin",
          label: item.isPinned ? t("unpin") : t("pin"),
          onSelect: () => onPin(item.id, !item.isPinned),
        }]
      : []),
    ...(onSetPinShortcut
      ? Array.from({ length: 10 }, (_, shortcut) => ({
          id: `pin-shortcut-${shortcut}`,
          label:
            item.pinShortcut === shortcut
              ? `${t("removePinShortcut")} ⌃⌘${shortcut}`
              : `${t("pinShortcut")} ⌃⌘${shortcut}`,
          onSelect: () =>
            onSetPinShortcut(
              item.id,
              item.pinShortcut === shortcut ? null : shortcut,
            ),
        }))
      : []),
    ...(onIgnoreApp && item.sourceApp
      ? [
          {
            id: "ignore-app",
            label: t("ignoreAppAction", { app: item.sourceApp }),
            onSelect: () => onIgnoreApp(item.sourceApp!),
          },
        ]
      : []),
    ...(onDelete
      ? [{
          id: "delete",
          label: t("delete"),
          destructive: true,
          onSelect: () => onDelete(item.id),
        }]
      : []),
  ];

  return (
    <>
    <article
      className={cn(
        "group panel flex flex-col p-3.5 transition-colors hover:bg-[var(--color-surface-hover)]",
        selected && "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)]",
      )}
      onClick={(event) => {
        if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          onToggleSelect?.(item.id);
          return;
        }
        onCopy?.(item.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(item.id);
            }}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              selected
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-transparent hover:text-[var(--color-text-muted)]",
            )}
            aria-label={selected ? "Unselect item" : "Select item"}
          >
            <Check size={12} />
          </button>
          {isDownloadFileItem(item) ? (
            <FileIcon item={item} size="md" title={item.fileName ?? appLabel} />
          ) : (
            <AppIcon appName={item.sourceApp} size="md" title={appLabel} />
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--color-text-secondary)]">
              {appLabel}
              <span className="text-[var(--color-text-muted)]"> · {typeLabel}</span>
            </p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">
              {timeLabel} · {sizeLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {item.pinShortcut !== null && item.pinShortcut !== undefined && (
            <span className="flex h-7 items-center rounded-[6px] bg-[var(--color-accent-subtle)] px-1.5 text-[10px] font-semibold text-[var(--color-accent)]">
              ⌃⌘{item.pinShortcut}
            </span>
          )}
          {onPin && (
            <button
              type="button"
              className={cn(
                "rounded-[6px] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]",
                item.isPinned && "text-[var(--color-accent)] opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onPin(item.id, !item.isPinned);
              }}
              aria-label={item.isPinned ? t("unpin") : t("pin")}
            >
              {item.pinShortcut !== null && item.pinShortcut !== undefined ? (
                <Keyboard size={14} />
              ) : (
                <Pin size={14} fill={item.isPinned ? "currentColor" : "none"} />
              )}
            </button>
          )}
          {onFavorite && (
            <button
              type="button"
              className={cn(
                "rounded-[6px] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]",
                item.isFavorite && "text-amber-500 opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onFavorite(item.id);
              }}
              aria-label="Toggle favorite"
            >
              <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="rounded-[6px] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)]"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {item.itemType === "image" && item.thumbnail ? (
        <div className="mb-2.5 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <img
            src={item.thumbnail}
            alt="Clipboard image"
            className="h-28 w-full object-cover"
            draggable={false}
          />
        </div>
      ) : isColor && colorValue ? (
        <div className="mb-2.5 flex items-center gap-2.5">
          <div
            className="h-10 w-10 rounded-[var(--radius-md)] border border-[var(--color-border)]"
            style={{ backgroundColor: colorValue }}
          />
          <code className="font-mono text-xs text-[var(--color-text-secondary)]">
            {colorValue}
          </code>
        </div>
      ) : (
        <p
          className={cn(
            "mb-2.5 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--color-text-secondary)]",
            item.itemType === "code" && "font-mono text-[12px] text-[var(--color-success)]",
            item.itemType === "url" && "text-[var(--color-accent)]",
          )}
        >
          {preview}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-2.5">
        <span className="truncate rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
          {item.categoryName}
        </span>
        {item.fileName && (
          <span className="truncate text-[11px] text-[var(--color-text-muted)]">
            {item.fileName}
          </span>
        )}
      </div>
    </article>
    {menu && (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        items={contextItems}
        onClose={() => setMenu(null)}
      />
    )}
    </>
  );
}
