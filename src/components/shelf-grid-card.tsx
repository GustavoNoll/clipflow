import { useState } from "react";
import { MoreHorizontal, Pin, Star, Trash2 } from "lucide-react";
import { copyItemToClipboard } from "../lib/api";
import { ItemMetaFooter } from "./item-meta-footer";
import { useI18n } from "../lib/i18n";
import { isSensitiveContent, privacyPreview } from "../lib/privacy";
import { useSettings } from "../lib/settings-context";
import { smartActionsForItem } from "../lib/smart-actions";
import type { ClipboardItem } from "../lib/types";
import { cn } from "../lib/utils";
import { ContextMenu, type ContextMenuAction } from "./context-menu";

interface ShelfGridCardProps {
  item: ClipboardItem;
  variant?: "dark" | "light";
  onPaste: (id: string) => void;
  onCopy: (id: string) => void;
  onFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ShelfGridCard({
  item,
  variant = "dark",
  onPaste,
  onCopy,
  onFavorite,
  onDelete,
}: ShelfGridCardProps) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const isLight = variant === "light";
  const isMedia = item.itemType === "image" || item.itemType === "file";
  const isColor = item.itemType === "color";
  const displayName =
    item.fileName ??
    (item.itemType === "url"
      ? item.preview.replace(/^https?:\/\//, "").slice(0, 28)
      : undefined);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const preview = privacyPreview(item.preview, settings.hideSensitiveContent);
  const isSensitiveLocked =
    settings.hideSensitiveContent && isSensitiveContent(item.preview);

  const contextItems: ContextMenuAction[] = [
    {
      id: "paste",
      label: isSensitiveLocked ? t("unlockPaste") : t("paste"),
      onSelect: () => onPaste(item.id),
    },
    {
      id: "copy",
      label: isSensitiveLocked ? t("unlockCopy") : t("copyToClipboard"),
      onSelect: () => {
        void copyItemToClipboard(
          item.id,
          t("copiedToClipboard"),
        );
      },
    },
    ...(isSensitiveLocked ? [] : smartActionsForItem(item).map((action) => ({
      id: action.id,
      label: action.label,
      onSelect: () => {
        void action.run();
      },
    }))),
    {
      id: "favorite",
      label: item.isFavorite ? t("removeFavorite") : t("addFavorite"),
      onSelect: () => onFavorite(item.id),
    },
    {
      id: "delete",
      label: t("delete"),
      destructive: true,
      onSelect: () => onDelete(item.id),
    },
  ];

  return (
    <>
    <article
      className="group relative h-full cursor-pointer"
      onClick={() => onCopy(item.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-[16px] border transition-colors",
          isLight
            ? "border-white/45 bg-white/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl hover:border-white/65 hover:bg-white/58"
            : "border-white/[0.10] bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:border-white/[0.16] hover:bg-white/[0.10]",
        )}
      >
        <div className="absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm",
              isLight
                ? "bg-white/80 text-zinc-600 hover:bg-white"
                : "bg-black/50 text-white/80 hover:bg-black/70",
            )}
            aria-label={t("moreOptions")}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {item.isPinned && (
          <div
            className={cn(
              "absolute left-2 top-2 z-20 flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-semibold backdrop-blur-sm",
              isLight
                ? "bg-white/85 text-[#5b5fc7]"
                : "bg-black/55 text-white/85",
            )}
          >
            <Pin size={11} fill="currentColor" />
            {item.pinShortcut !== null && item.pinShortcut !== undefined
              ? `⌃⌘${item.pinShortcut}`
              : "PIN"}
          </div>
        )}
        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm hover:bg-red-500 hover:text-white",
              isLight
                ? "bg-white/80 text-zinc-600"
                : "bg-black/50 text-white/80",
            )}
            aria-label={t("delete")}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(item.id);
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm hover:bg-amber-500 hover:text-white",
              isLight ? "bg-white/80 text-zinc-600" : "bg-black/50 text-white/80",
              item.isFavorite && "bg-amber-500 text-white opacity-100",
            )}
            aria-label={item.isFavorite ? t("removeFavorite") : t("addFavorite")}
          >
            <Star size={13} fill={item.isFavorite ? "currentColor" : "none"} />
          </button>
        </div>

        {isMedia && item.thumbnail ? (
          <div className="relative aspect-[5/3] w-full overflow-hidden">
            <img
              src={item.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              draggable
            />
            {displayName && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2.5 pb-2 pt-8">
                <p className="truncate text-[11px] font-medium text-white/90">
                  {displayName}
                </p>
              </div>
            )}
          </div>
        ) : isColor ? (
          <div className="flex min-h-[88px] flex-1 flex-col items-center justify-center gap-2 p-3">
            <div
              className={cn(
                "h-10 w-10 rounded-[10px] shadow-inner",
                isLight ? "ring-1 ring-black/8" : "border border-white/10",
              )}
              style={{ backgroundColor: item.content.trim() }}
            />
            <code
              className={cn(
                "text-[11px]",
                isLight ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              {item.content.trim()}
            </code>
          </div>
        ) : (
          <div className="min-h-[86px] flex-1 p-3 pt-8">
            <p
              className={cn(
                "line-clamp-4 text-[13px] leading-[1.45]",
                isLight ? "text-zinc-700" : "text-zinc-300",
                item.itemType === "code" &&
                  (isLight
                    ? "font-mono text-[12px] text-emerald-700"
                    : "font-mono text-[12px] text-emerald-400/90"),
                item.itemType === "url" &&
                  (isLight ? "text-[#0071e3]" : "text-sky-400/90"),
              )}
            >
              {preview}
            </p>
          </div>
        )}

        <ItemMetaFooter item={item} variant={variant} className="mt-auto" />
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
