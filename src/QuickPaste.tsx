import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Heart, Search } from "lucide-react";
import { AppIcon } from "./components/app-icon";
import { ClipboardFeedback } from "./components/clipboard-feedback";
import {
  applyFirstSearchFilterSuggestion,
  hasSearchFilterSuggestion,
  SearchFilterSuggestions,
} from "./components/search-filter-suggestions";
import {
  copyItemToClipboard,
  copyItemsToClipboard,
  copyDownloadPathsToClipboard,
  copyDownloadToClipboard,
  getContextualRecent,
  listCategories,
  listItems,
  listRecentDownloads,
  listSourceApps,
} from "./lib/api";
import { getItemSizeLabel, getSourceAppLabel } from "./lib/item-meta";
import { privacyPreview } from "./lib/privacy";
import { useSettings } from "./lib/settings-context";
import {
  formatRelativeTimeForLanguage,
  translateCategoryName,
  useI18n,
} from "./lib/i18n";
import type { Category, ClipboardItem, SourceApp } from "./lib/types";
import { cn } from "./lib/utils";

const FAVORITES_CATEGORY_ID = -1;
const DOWNLOADS_CATEGORY_ID = -2;

function isHistoryCategory(category?: Category) {
  return category?.name.trim().toLowerCase() === "history";
}

export default function QuickPaste() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<ClipboardItem[]>([]);
  const [downloads, setDownloads] = useState<ClipboardItem[]>([]);
  const [favorites, setFavorites] = useState<ClipboardItem[]>([]);
  const [searchResults, setSearchResults] = useState<ClipboardItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sourceApps, setSourceApps] = useState<SourceApp[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [recentItems, downloadItems, favItems, cats, apps] = await Promise.all([
      getContextualRecent(10),
      listRecentDownloads(12),
      listItems({ favoritesOnly: true, limit: 8, offset: 0 }),
      listCategories(),
      listSourceApps(),
    ]);
    setRecent(recentItems);
    setDownloads(downloadItems);
    setFavorites(favItems.items);
    setCategories(cats);
    setSourceApps(apps);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("quick-paste-window");
    document.body.classList.add("quick-paste-window");
    refresh();
    const unlistenOpen = listen("quick-paste:open", () => {
      setQuery("");
      setActiveCategory(undefined);
      setSelected(new Set());
      setSelectedIndex(0);
      refresh();
    });
    const unlistenCleared = listen("clipboard:history-cleared", () => {
      setRecent([]);
      setFavorites([]);
      setSearchResults([]);
      setSelected(new Set());
      refresh();
    });
    return () => {
      document.documentElement.classList.remove("quick-paste-window");
      document.body.classList.remove("quick-paste-window");
      unlistenOpen.then((fn) => fn());
      unlistenCleared.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const selectedCategory = categories.find((cat) => cat.id === activeCategory);
        const showingDownloads = activeCategory === DOWNLOADS_CATEGORY_ID;
        const shouldFilterCategory =
          activeCategory &&
          activeCategory !== FAVORITES_CATEGORY_ID &&
          activeCategory !== DOWNLOADS_CATEGORY_ID &&
          !isHistoryCategory(selectedCategory);
        const shouldLoadAllHistory =
          activeCategory &&
          activeCategory !== FAVORITES_CATEGORY_ID &&
          activeCategory !== DOWNLOADS_CATEGORY_ID &&
          isHistoryCategory(selectedCategory);

        if (showingDownloads) {
          const downloadItems = await listRecentDownloads(20);
          const normalizedQuery = query.trim().toLowerCase();
          setDownloads(
            normalizedQuery
              ? downloadItems.filter((item) =>
                  `${item.preview} ${item.content}`.toLowerCase().includes(normalizedQuery),
                )
              : downloadItems,
          );
          setSearchResults([]);
        } else if (query.trim()) {
          const result = await listItems({
            query: query.trim(),
            categoryId: shouldFilterCategory ? activeCategory : undefined,
            limit: 20,
            offset: 0,
          });
          setSearchResults(result.items);
        } else if (shouldFilterCategory || shouldLoadAllHistory) {
          const result = await listItems({
            categoryId: shouldFilterCategory ? activeCategory : undefined,
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
  }, [query, activeCategory, categories]);

  async function handleSelect(id: string) {
    const item = [...recent, ...favorites, ...searchResults].find(
      (candidate) => candidate.id === id,
    ) ?? downloads.find(
      (candidate) => candidate.id === id,
    );
    if (activeCategory === DOWNLOADS_CATEGORY_ID && item) {
      await copyDownloadToClipboard(item.content, t("copiedToClipboard"));
    } else {
      await copyItemToClipboard(
        id,
        item ? t("copiedToClipboard") : undefined,
      );
    }
    await getCurrentWindow().hide();
  }

  function handleToggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const showingFavorites = activeCategory === FAVORITES_CATEGORY_ID;
  const showingDownloads = activeCategory === DOWNLOADS_CATEGORY_ID;
  const selectedCategory = categories.find((cat) => cat.id === activeCategory);
  const historyCategorySelected =
    Boolean(activeCategory) && isHistoryCategory(selectedCategory);
  const showingHistory =
    !showingFavorites &&
    !showingDownloads &&
    (!activeCategory || isHistoryCategory(selectedCategory));
  const displayItems = showingDownloads
    ? downloads
    : query.trim()
      ? searchResults
      : showingFavorites
      ? favorites
      : historyCategorySelected
        ? searchResults
        : showingHistory
          ? recent
          : activeCategory
            ? searchResults
            : recent;

  const handleBatchCopy = useCallback(async () => {
    if (selected.size === 0) return;
    const orderedIds = displayItems
      .filter((item) => selected.has(item.id))
      .map((item) => item.id);
    if (orderedIds.length === 0) return;
    if (showingDownloads) {
      await copyDownloadPathsToClipboard(
        displayItems.filter((item) => selected.has(item.id)).map((item) => item.content),
      );
    } else {
      await copyItemsToClipboard(orderedIds);
    }
    setSelected(new Set());
  }, [displayItems, selected, showingDownloads]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void getCurrentWindow().hide();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "c" &&
        selected.size > 0 &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        void handleBatchCopy();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size, handleBatchCopy]);

  useEffect(() => {
    setSelectedIndex(0);
    setSelected(new Set());
  }, [query, activeCategory]);

  useEffect(() => {
    setSelectedIndex((index) =>
      displayItems.length === 0 ? 0 : Math.min(index, displayItems.length - 1),
    );
  }, [displayItems.length]);

  useEffect(() => {
    function onNavigation(event: KeyboardEvent) {
      if (displayItems.length === 0) return;
      if (hasSearchFilterSuggestion(query, sourceApps)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, displayItems.length - 1));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (selected.size > 0) {
          void handleBatchCopy();
          return;
        }
        const item = displayItems[selectedIndex];
        if (item) {
          void handleSelect(item.id);
        }
      }
    }

    window.addEventListener("keydown", onNavigation);
    return () => window.removeEventListener("keydown", onNavigation);
  }, [displayItems, query, selected.size, selectedIndex, sourceApps, handleBatchCopy]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-black/35 bg-black/58 shadow-[0_26px_70px_rgba(0,0,0,0.46)] ring-1 ring-white/[0.035] backdrop-blur-2xl">
      <ClipboardFeedback variant="dark" position="bottom" compact />
      <div className="px-4 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2">
          <div className="quick-paste-search relative flex-1 rounded-[13px] border border-white/[0.10] bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-200 ease-out focus-within:border-white/[0.18] focus-within:bg-white/[0.11] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.05)]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/42"
            />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.key === "Enter" || event.key === "Tab") &&
                  hasSearchFilterSuggestion(query, sourceApps)
                ) {
                  event.preventDefault();
                  setQuery(applyFirstSearchFilterSuggestion(query, sourceApps));
                }
              }}
              placeholder={t("searchClipboard")}
              className="quick-paste-search-input h-10 w-full appearance-none border-0 bg-transparent pl-9 pr-3 text-[13px] font-semibold tracking-tight text-white/86 outline-none placeholder:text-white/38 focus:outline-none"
            />
            <SearchFilterSuggestions
              query={query}
              sourceApps={sourceApps}
              dark
              onApply={setQuery}
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() =>
              setActiveCategory((prev) =>
                prev === FAVORITES_CATEGORY_ID ? undefined : FAVORITES_CATEGORY_ID,
              )
            }
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors",
              showingFavorites
                ? "bg-white text-black"
                : "bg-white/[0.08] text-white/66 hover:bg-white/[0.12] hover:text-white/88",
            )}
          >
            ★
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                setActiveCategory((prev) => (prev === cat.id ? undefined : cat.id))
              }
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors",
                (activeCategory === cat.id && !showingDownloads) ||
                  (isHistoryCategory(cat) && showingHistory)
                  ? "bg-white text-black"
                  : "bg-white/[0.08] text-white/66 hover:bg-white/[0.12] hover:text-white/88",
              )}
            >
              {translateCategoryName(settings.language, cat.name)}
              {cat.itemCount > 0 && (
                <span className="ml-1 opacity-55">{cat.itemCount}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setActiveCategory((prev) =>
                prev === DOWNLOADS_CATEGORY_ID ? undefined : DOWNLOADS_CATEGORY_ID,
              )
            }
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors",
              showingDownloads
                ? "bg-white text-black"
                : "bg-white/[0.08] text-white/66 hover:bg-white/[0.12] hover:text-white/88",
            )}
          >
            <Download size={12} />
            {t("downloads")}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1 scrollbar-thin">
        <section>
          <QuickSectionHeader
            label={
              showingDownloads
                ? t("downloads")
                : query.trim()
                  ? t("results")
                  : showingFavorites
                    ? t("favorites")
                    : showingHistory
                      ? t("recent")
                      : t("category")
            }
            detail={displayItems.length > 0 ? t("shown", { count: displayItems.length }) : undefined}
          />
          <div>
            {loading && displayItems.length === 0 && (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-[106px] animate-pulse rounded-[11px] border border-white/[0.09] bg-white/[0.08] backdrop-blur-xl">
                  </div>
                ))}
              </div>
            )}
            {!loading && displayItems.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/[0.08] text-white/60">
                  <Search size={18} />
                </div>
                <p className="text-sm font-medium text-white/86">
                  {t("noClipsFound")}
                </p>
                <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-white/45">
                  {t("noClipsFoundBody")}
                </p>
              </div>
            )}
            {!loading &&
              displayItems.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {displayItems.map((item, index) => (
                    <QuickRow
                      key={item.id}
                      item={item}
                      active={index === selectedIndex}
                      selected={selected.has(item.id)}
                      onSelect={handleSelect}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </div>
              )}
          </div>
        </section>
      </div>

      <div className="border-t border-white/[0.08] bg-white/[0.055] px-4 py-2 backdrop-blur-xl">
        <div className="flex items-center justify-center gap-2 text-[10px] font-medium text-white/38">
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleBatchCopy();
              }}
              className="rounded-full bg-white px-2.5 py-1 font-semibold text-black"
            >
              <Copy size={11} className="mr-1 inline" />
              {t("copySelected")}
            </button>
          ) : (
            <span className="rounded-full bg-white/[0.06] px-2 py-1">{t("recentShortcut")}</span>
          )}
          <span className="rounded-full bg-white/[0.06] px-2 py-1">{selected.size > 0 ? "⌘C / Ctrl+C" : t("clickToCopy")}</span>
          <span className="rounded-full bg-white/[0.06] px-2 py-1">{t("escCloses")}</span>
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
    <div className="mb-2 flex items-center justify-between px-1">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
        {icon}
        {label}
      </h3>
      {detail && (
        <span className="text-[11px] font-medium text-white/38">
          {detail}
        </span>
      )}
    </div>
  );
}

function QuickRow({
  item,
  active,
  selected,
  onSelect,
  onToggleSelect,
}: {
  item: ClipboardItem;
  active: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
}) {
  const { settings } = useSettings();
  const appLabel = getSourceAppLabel(item);
  const sizeLabel = getItemSizeLabel(item);
  const preview = privacyPreview(item.preview, settings.hideSensitiveContent);
  const timeLabel = formatRelativeTimeForLanguage(item.createdAt, settings.language);
  const isImage = item.itemType === "image" && item.thumbnail;
  const isColor = item.itemType === "color";

  return (
    <button
      type="button"
      onClick={(event) => {
        if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          onToggleSelect(item.id);
          return;
        }
        onSelect(item.id);
      }}
      className={cn(
        "group relative flex h-[112px] min-w-0 flex-col overflow-hidden rounded-[11px] border bg-white/[0.07] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-colors hover:border-white/[0.16] hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/18",
        active
          ? "border-white/30 bg-white/[0.105] ring-2 ring-white/12"
          : "border-white/[0.07]",
        selected && "border-white/50 ring-2 ring-white/38",
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-black shadow">
          ✓
        </span>
      )}
      {isImage ? (
        <img
          src={item.thumbnail}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-88 transition-transform duration-200 group-hover:scale-[1.02]"
          draggable={false}
        />
      ) : isColor ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: item.content.trim() }}
        />
      ) : (
        <div className="absolute left-2 top-2">
          <AppIcon appName={item.sourceApp} size="sm" title={appLabel} />
        </div>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex min-h-[58px] flex-col justify-end px-2.5 pb-2 pt-7",
          isImage || isColor
            ? "bg-gradient-to-t from-black/82 via-black/42 to-transparent"
            : "bg-transparent",
        )}
      >
        <p
          className={cn(
            "line-clamp-3 break-words text-[12px] font-semibold leading-[1.28] tracking-[-0.01em]",
            isImage || isColor ? "text-white" : "text-white/86",
          )}
        >
          {preview}
        </p>
        <p className="mt-1 truncate text-[10px] font-medium text-white/45">
          {appLabel} · {timeLabel} · {sizeLabel}
        </p>
      </div>

      {item.isFavorite && (
        <Heart
          size={13}
          className="absolute right-2 top-2 fill-amber-400 text-amber-400 drop-shadow"
        />
      )}
      {item.isPinned && (
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur">
          {item.pinShortcut !== null && item.pinShortcut !== undefined
            ? `⌃⌘${item.pinShortcut}`
            : "PIN"}
        </span>
      )}
    </button>
  );
}
