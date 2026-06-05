import { useState } from "react";
import { MoreHorizontal, Star, Trash2 } from "lucide-react";
import { copyItemToClipboard, itemTypeLabel } from "../lib/api";
import { ItemMetaFooter } from "./item-meta-footer";
import { privacyPreview } from "../lib/privacy";
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

  const contextItems: ContextMenuAction[] = [
    {
      id: "paste",
      label: "Paste",
      onSelect: () => onPaste(item.id),
    },
    {
      id: "copy",
      label: "Copy to Clipboard",
      onSelect: () => {
        void copyItemToClipboard(
          item.id,
          `Copied ${itemTypeLabel(item.itemType).toLowerCase()}`,
        );
      },
    },
    ...smartActionsForItem(item).map((action) => ({
      id: action.id,
      label: action.label,
      onSelect: () => {
        void action.run();
      },
    })),
    {
      id: "favorite",
      label: item.isFavorite ? "Remove from Favorites" : "Add to Favorites",
      onSelect: () => onFavorite(item.id),
    },
    {
      id: "delete",
      label: "Delete",
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
            ? "border-black/[0.06] bg-[#f5f5f7] hover:border-black/10 hover:bg-white"
            : "border-white/[0.06] bg-[#1c1c20] hover:border-white/10 hover:bg-[#222228]",
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
            aria-label="More options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
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
            aria-label="Delete"
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
            aria-label="Favorite"
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
