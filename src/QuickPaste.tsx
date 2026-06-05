import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { Heart, Search } from "lucide-react";
import { AppLogo } from "./components/app-logo";
import { AppIcon } from "./components/app-icon";
import { ClipboardFeedback } from "./components/clipboard-feedback";
import {
  copyItemToClipboard,
  formatRelativeTime,
  getContextualRecent,
  itemTypeLabel,
  listCategories,
  listItems,
} from "./lib/api";
import { getItemSizeLabel, getSourceAppLabel } from "./lib/item-meta";
import { privacyPreview } from "./lib/privacy";
import { useSettings } from "./lib/settings-context";
import type { Category, ClipboardItem } from "./lib/types";
import { cn } from "./lib/utils";

export default function QuickPaste() {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<ClipboardItem[]>([]);
  const [favorites, setFavorites] = useState<ClipboardItem[]>([]);
  const [searchResults, setSearchResults] = useState<ClipboardItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [recentItems, favItems, cats] = await Promise.all([
      getContextualRecent(10),
      listItems({ favoritesOnly: true, limit: 8, offset: 0 }),
      listCategories(),
    ]);
    setRecent(recentItems);
    setFavorites(favItems.items);
    setCategories(cats);
  }, []);

  useEffect(() => {
    refresh();
    const unlistenOpen = listen("quick-paste:open", () => {
      setQuery("");
      setActiveCategory(undefined);
      refresh();
    });
    const unlistenCleared = listen("clipboard:history-cleared", () => {
      setRecent([]);
      setFavorites([]);
      setSearchResults([]);
      refresh();
    });
    return () => {
      unlistenOpen.then((fn) => fn());
      unlistenCleared.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void getCurrentWindow().hide();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (query.trim()) {
          const result = await listItems({
            query: query.trim(),
            categoryId: activeCategory,
            limit: 20,
            offset: 0,
          });
          setSearchResults(result.items);
        } else if (activeCategory) {
          const result = await listItems({
            categoryId: activeCategory,
            limit: 20,
            offset: 0,
          });
          setSearchResults(result.items);
        } else {
          setSearchResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [query, activeCategory]);

  async function handleSelect(id: string) {
    const item = [...recent, ...favorites, ...searchResults].find(
      (candidate) => candidate.id === id,
    );
    await copyItemToClipboard(
      id,
      item ? `Copied ${itemTypeLabel(item.itemType).toLowerCase()}` : undefined,
    );
    await getCurrentWindow().hide();
  }

  const displayItems = query.trim() || activeCategory ? searchResults : recent;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-black/[0.08] bg-[#f5f5f7] shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
      <ClipboardFeedback variant="light" position="bottom" compact />
      <div className="border-b border-black/[0.06] bg-white/92 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" />
          <div className="relative flex-1 rounded-[18px] border border-black/[0.08] bg-[#f7f7f9] shadow-inner transition-all focus-within:border-[var(--color-accent)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--color-accent-subtle)]">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clipboard…"
              className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-[15px] font-medium tracking-tight text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                setActiveCategory((prev) => (prev === cat.id ? undefined : cat.id))
              }
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors",
                activeCategory === cat.id
                  ? "bg-[var(--color-accent)] text-white shadow-[0_6px_16px_var(--color-accent-muted)]"
                  : "bg-black/[0.035] text-[var(--color-text-secondary)] hover:bg-black/[0.06] hover:text-[var(--color-text)]",
              )}
            >
              {cat.name}
              {cat.itemCount > 0 && (
                <span className="ml-1 opacity-55">{cat.itemCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!query && !activeCategory && favorites.length > 0 && (
          <section className="mb-4">
            <QuickSectionHeader icon={<Heart size={12} />} label="Favorites" />
            <div className="rounded-[16px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {favorites.slice(0, 4).map((item) => (
                <QuickRow
                  key={item.id}
                  item={item}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <QuickSectionHeader
            label={query.trim() ? "Results" : activeCategory ? "Category" : "Recent"}
            detail={displayItems.length > 0 ? `${displayItems.length} shown` : undefined}
          />
          <div className="rounded-[16px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {loading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-[12px] px-2 py-2">
                    <div className="h-10 w-10 animate-pulse rounded-[10px] bg-black/[0.06]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 animate-pulse rounded bg-black/[0.06]" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-black/[0.05]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && displayItems.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                  <Search size={18} />
                </div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  No clips found
                </p>
                <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Copy text, links, code, images, or screenshots. OCR text is searchable too.
                </p>
              </div>
            )}
            {!loading &&
              displayItems.map((item) => (
                <QuickRow
                  key={item.id}
                  item={item}
                  onSelect={handleSelect}
                />
              ))}
          </div>
        </section>
      </div>

      <div className="border-t border-black/[0.06] bg-white/80 px-4 py-2.5">
        <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-[var(--color-text-muted)]">
          <span className="rounded-full bg-black/[0.04] px-2 py-1">⌃⌘0–9 recent</span>
          <span className="rounded-full bg-black/[0.04] px-2 py-1">click to copy</span>
          <span className="rounded-full bg-black/[0.04] px-2 py-1">Esc closes</span>
        </div>
      </div>
    </div>
  );
}

function QuickSectionHeader({
  icon,
  label,
  detail,
}: {
  icon?: React.ReactNode;
  label: string;
  detail?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between px-1">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
        {icon}
        {label}
      </h3>
      {detail && (
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
          {detail}
        </span>
      )}
    </div>
  );
}

function QuickRow({
  item,
  onSelect,
}: {
  item: ClipboardItem;
  onSelect: (id: string) => void;
}) {
  const { settings } = useSettings();
  const appLabel = getSourceAppLabel(item);
  const sizeLabel = getItemSizeLabel(item);
  const preview = privacyPreview(item.preview, settings.hideSensitiveContent);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group flex w-full items-center gap-3 border-b border-black/[0.045] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[#f7f7fb] focus:outline-none focus-visible:bg-[var(--color-accent-subtle)]"
    >
      {item.itemType === "image" && item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="h-10 w-10 shrink-0 rounded-[10px] object-cover ring-1 ring-black/[0.06]"
        />
      ) : item.itemType === "color" ? (
        <div
          className="h-10 w-10 shrink-0 rounded-[10px] border border-black/[0.08] shadow-inner"
          style={{ backgroundColor: item.content.trim() }}
        />
      ) : (
        <AppIcon appName={item.sourceApp} size="md" title={appLabel} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--color-text)]">
          {preview}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[var(--color-text-muted)]">
          {appLabel} · {itemTypeLabel(item.itemType)} · {formatRelativeTime(item.createdAt)} · {sizeLabel}
        </p>
      </div>
      {item.isFavorite && (
        <Heart size={12} className="shrink-0 fill-amber-500 text-amber-500" />
      )}
    </button>
  );
}
