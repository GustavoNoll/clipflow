import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Grid3X3, Plus, Search, Star } from "lucide-react";
import { AppIcon } from "./components/app-icon";
import { ClipboardFeedback } from "./components/clipboard-feedback";
import { ShelfGridCard } from "./components/shelf-grid-card";
import {
  createCategory,
  copyItemToClipboard,
  deleteItem,
  getContextualRecent,
  itemTypeLabel,
  listCategories,
  listItems,
  openLibraryWindow,
  pasteItemById,
  setNotchExpanded,
  setNotchHoverPreview,
  toggleFavorite,
} from "./lib/api";
import { getItemPeekLabel } from "./lib/item-label";
import { groupItemsByDate } from "./lib/date-groups";
import { applySettingsToDocument, DEFAULT_SETTINGS } from "./lib/settings";
import { useSettings } from "./lib/settings-context";
import type { Category, ClipboardItem } from "./lib/types";
import { cn } from "./lib/utils";

export default function NotchShelf() {
  const { settings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [peekItem, setPeekItem] = useState<ClipboardItem | null>(null);
  const [notchHovered, setNotchHovered] = useState(false);
  const [hoverClosing, setHoverClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shelfOpen = expanded || notchHovered;
  const shelfVisible = shelfOpen || hoverClosing;
  const itemGroups = useMemo(() => groupItemsByDate(items), [items]);

  const refreshPeek = useCallback(async () => {
    const recent = await getContextualRecent(1);
    setPeekItem(recent[0] ?? null);
  }, []);

  const refreshCategories = useCallback(async () => {
    const cats = await listCategories();
    setCategories(cats);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listItems({
        query: debouncedQuery || undefined,
        categoryId: favoritesOnly ? undefined : activeCategory,
        favoritesOnly,
        limit: 24,
        offset: 0,
      });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, activeCategory, favoritesOnly]);

  const collapse = useCallback(async () => {
    setExpanded(false);
    setNotchHovered(false);
    setHoverClosing(false);
    await setNotchExpanded(false);
    await setNotchHoverPreview(false);
    refreshPeek();
  }, [refreshPeek]);

  const clearHoverPreview = useCallback(async () => {
    if (!notchHovered) return;
    setHoverClosing(true);
    await setNotchHoverPreview(false);
  }, [notchHovered]);

  useEffect(() => {
    document.documentElement.classList.add("notch-shelf", "notch-shelf-dark");
    document.body.classList.add("notch-shelf");
    applySettingsToDocument({ ...DEFAULT_SETTINGS, theme: "dark" });
    refreshPeek();
    return () => {
      document.documentElement.classList.remove("notch-shelf", "notch-shelf-dark");
      document.body.classList.remove("notch-shelf");
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    };
  }, [refreshPeek]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (shelfOpen) loadItems();
  }, [debouncedQuery, activeCategory, favoritesOnly, shelfOpen, loadItems]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  useEffect(() => {
    if (!settings.notchHoverEnabled) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && shelfOpen) {
          void collapse();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [settings.notchHoverEnabled, shelfOpen, collapse]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && shelfOpen) {
        event.preventDefault();
        void collapse();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shelfOpen, collapse]);

  useEffect(() => {
    const unlistenExpanded = listen<boolean>("notch-shelf:expanded", (e) => {
      setExpanded(e.payload);
      if (!e.payload) {
        setNotchHovered(false);
        setHoverClosing(false);
        refreshPeek();
      } else {
        setHoverClosing(false);
        refreshCategories();
        loadItems();
      }
    });
    const unlistenHoverPreview = listen<boolean>(
      "notch-shelf:hover-preview",
      (e) => {
        if (e.payload) {
          if (hoverCloseTimerRef.current) {
            clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
          }
          setHoverClosing(false);
          setNotchHovered(true);
          refreshPeek();
          refreshCategories();
          loadItems();
          return;
        }
        setHoverClosing(true);
        if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = setTimeout(() => {
          hoverCloseTimerRef.current = null;
          setNotchHovered(false);
          setHoverClosing(false);
          refreshPeek();
        }, 240);
      },
    );
    const unlistenOpen = listen("notch-shelf:open", () => {
      setExpanded(true);
      setQuery("");
      setDebouncedQuery("");
      refreshCategories();
      loadItems();
    });
    const unlistenNew = listen("clipboard:new-item", () => {
      refreshPeek();
      if (shelfOpen) loadItems();
      refreshCategories();
    });
    const unlistenCleared = listen("clipboard:history-cleared", () => {
      setPeekItem(null);
      setItems([]);
      refreshCategories();
    });
    return () => {
      unlistenExpanded.then((fn) => fn());
      unlistenHoverPreview.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenNew.then((fn) => fn());
      unlistenCleared.then((fn) => fn());
    };
  }, [loadItems, refreshCategories, refreshPeek, shelfOpen]);

  function selectFavorites() {
    setFavoritesOnly((prev) => {
      const next = !prev;
      if (next) setActiveCategory(undefined);
      return next;
    });
  }

  function selectCategory(id: number) {
    setFavoritesOnly(false);
    const category = categories.find((cat) => cat.id === id);
    if (category?.name === "History") {
      setActiveCategory(undefined);
      return;
    }
    setActiveCategory((prev) => (prev === id ? undefined : id));
  }

  async function handlePaste(id: string) {
    if (settings.notchHoverEnabled) {
      await collapse();
    } else {
      await getCurrentWindow().hide();
      setExpanded(false);
    }
    await pasteItemById(id);
  }

  async function handleCopy(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    await copyItemToClipboard(
      id,
      item ? `Copied ${itemTypeLabel(item.itemType).toLowerCase()}` : undefined,
    );
  }

  async function handleFavorite(id: string) {
    await toggleFavorite(id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
      ),
    );
    refreshCategories();
  }

  async function handleDelete(id: string) {
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    refreshCategories();
    refreshPeek();
  }

  async function handleOpenLibrary() {
    await openLibraryWindow();
  }

  async function handleNotchHover(hovered: boolean) {
    if (!settings.notchHoverEnabled || expanded) return;
    await setNotchHoverPreview(hovered);
  }

  function cancelLeaveTimer() {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }

  function handleShelfMouseEnter() {
    cancelLeaveTimer();
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setHoverClosing(false);
    if (!settings.notchHoverEnabled || expanded) return;
    void handleNotchHover(true);
  }

  function handleShelfMouseLeave() {
    if (!settings.notchHoverEnabled) return;
    cancelLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      if (expanded) {
        void collapse();
      } else {
        void clearHoverPreview();
      }
    }, 120);
  }

  async function handleCreateCategory() {
    const name = prompt("Category name");
    if (!name?.trim()) return;
    await createCategory(name.trim());
    refreshCategories();
  }

  return (
    <div
      className="notch-root flex h-full w-full flex-col items-center overflow-hidden"
      onMouseEnter={handleShelfMouseEnter}
      onMouseLeave={handleShelfMouseLeave}
    >
      <ClipboardFeedback variant="dark" position="bottom" compact />
      {!shelfVisible && settings.notchHoverEnabled && (
        <div
          className="notch-trigger h-full w-full bg-transparent"
          aria-label="Notch clipboard preview"
        />
      )}

      {!shelfVisible && !settings.notchHoverEnabled && (
        <div className="flex h-full w-full items-center justify-center bg-black">
          <CollapsedPeek item={peekItem} />
        </div>
      )}

      {shelfVisible && (
        <div
          className={cn(
            "notch-expanded-panel relative flex h-full w-full flex-col overflow-hidden rounded-b-[24px] bg-black pt-[34px]",
            hoverClosing && "notch-expanded-panel-exit",
          )}
        >
          <NotchHoverRail
            item={peekItem}
            onOpenLibrary={handleOpenLibrary}
            className="notch-rail-enter"
          />

          <div className="notch-search-enter flex items-center justify-between gap-3 px-6 pt-3 pb-2.5">
            <div className="relative w-full max-w-[420px]">
              <Search size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/38" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-full border-0 bg-transparent py-1 pl-7 pr-2 text-[16px] font-semibold tracking-tight text-white/88 outline-none placeholder:text-white/42"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ActionButton icon={<Star size={16} fill="currentColor" />} label="Favorites" onClick={selectFavorites} active={favoritesOnly} />
            </div>
          </div>

          <div className="notch-categories-enter flex items-center gap-2 overflow-x-auto px-6 pb-3 scrollbar-none">
            <FilterChip
              active={favoritesOnly}
              onClick={selectFavorites}
              icon={
                <Star
                  size={12}
                  fill={favoritesOnly ? "currentColor" : "none"}
                />
              }
            >
              Favorites
            </FilterChip>
            {categories.map((cat) => (
              <FilterChip
                key={cat.id}
                active={
                  !favoritesOnly &&
                  (cat.name === "History"
                    ? activeCategory === undefined
                    : activeCategory === cat.id)
                }
                onClick={() => selectCategory(cat.id)}
              >
                {cat.name}
                {cat.itemCount > 0 && (
                  <span className="ml-1 opacity-50">{cat.itemCount}</span>
                )}
              </FilterChip>
            ))}
            <button
              type="button"
              onClick={handleCreateCategory}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.09] text-white/62 transition-colors hover:bg-white/[0.14] hover:text-white/85"
              aria-label="Add category"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="notch-groups-enter min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6 scrollbar-thin">
            {loading && items.length === 0 && (
              <p className="py-8 text-center text-[12px] text-white/35">
                Loading…
              </p>
            )}
            {!loading && items.length === 0 && (
              <p className="py-8 text-center text-[12px] text-white/35">
                {settings.capturePaused ? "Capture paused" : "Nothing here yet"}
              </p>
            )}
            <div className="flex h-full w-max gap-5">
              {itemGroups.map((group) => (
                <section key={group.label} className="flex h-full shrink-0 flex-col">
                  <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-white/72">
                    {group.label}
                  </h3>
                  <div className="flex min-h-0 gap-3">
                    {group.items.map((item, index) => (
                      <div
                        key={item.id}
                        className="notch-item-card h-[150px] w-[220px] shrink-0"
                        style={{ animationDelay: `${565 + Math.min(index * 18, 120)}ms` }}
                      >
                        <ShelfGridCard
                          item={item}
                          variant="dark"
                          onPaste={handlePaste}
                          onCopy={handleCopy}
                          onFavorite={handleFavorite}
                          onDelete={handleDelete}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-white/62 transition-colors",
        active ? "bg-white text-black" : "bg-white/[0.09] hover:bg-white/[0.14] hover:text-white/88",
      )}
    >
      {icon}
    </button>
  );
}

function NotchHoverRail({
  item,
  onOpen,
  onOpenLibrary,
  className,
}: {
  item: ClipboardItem | null;
  onOpen?: () => void;
  onOpenLibrary?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 grid h-[34px] grid-cols-[1fr_150px_1fr] items-center px-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {item ? (
          <>
            <NotchRailIcon item={item} />
            <span className="min-w-0 truncate text-[11px] font-medium text-white/72">
              {getItemPeekLabel(item)}
            </span>
          </>
        ) : (
          <>
            <span className="block h-2 w-2 rounded-full bg-white/30" />
            <span className="text-[11px] font-medium text-white/40">
              ClipFlow
            </span>
          </>
        )}
      </div>
      <div aria-hidden="true" />
      <div className="flex justify-end gap-1.5">
        {onOpenLibrary && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenLibrary();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.10] text-white/70 transition-colors hover:bg-white/[0.18] hover:text-white"
            aria-label="Open ClipFlow window"
          >
            <ArrowUpRight size={13} />
          </button>
        )}
        {onOpen ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.10] text-white/70 transition-colors hover:bg-white/[0.18] hover:text-white"
            aria-label="Expand notch shelf"
          >
            <Grid3X3 size={13} />
          </button>
        ) : (
          <span className="h-2 w-2 rounded-full bg-[#5b5fc7]" />
        )}
      </div>
    </div>
  );
}

function NotchRailIcon({ item }: { item: ClipboardItem }) {
  if (item.itemType === "image" && item.sourceApp) {
    return <AppIcon appName={item.sourceApp} size="sm" />;
  }

  if (item.itemType === "image" && item.thumbnail) {
    return (
      <img
        src={item.thumbnail}
        alt=""
        className="h-[18px] w-[18px] shrink-0 rounded-[5px] object-cover ring-1 ring-white/10"
      />
    );
  }

  if (item.itemType === "color") {
    return (
      <div
        className="h-[18px] w-[18px] shrink-0 rounded-[5px] ring-1 ring-white/12"
        style={{ backgroundColor: item.content.trim() }}
      />
    );
  }

  return <AppIcon appName={item.sourceApp} size="sm" />;
}

function CollapsedPeek({ item }: { item: ClipboardItem | null }) {
  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="h-[3px] w-10 rounded-full bg-white/20" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-2 px-3">
      {item.itemType === "image" && item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="h-[18px] w-[18px] rounded-[4px] object-cover"
        />
      ) : item.itemType === "color" ? (
        <div
          className="h-[18px] w-[18px] rounded-[4px] border border-white/10"
          style={{ backgroundColor: item.content.trim() }}
        />
      ) : (
        <AppIcon appName={item.sourceApp} size="sm" />
      )}
      <p className="min-w-0 flex-1 truncate text-[11px] text-white/70">
        {getItemPeekLabel(item)}
      </p>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0071e3]" />
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold tracking-tight transition-colors",
        active
          ? "bg-white text-black"
          : "bg-white/[0.09] text-white/66 hover:bg-white/[0.14] hover:text-white/88",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
