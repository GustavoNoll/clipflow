import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CircleArrowUp,
  Copy,
  Download,
  Grid3X3,
  Plus,
  Star,
} from "lucide-react";
import { AppIcon } from "./components/app-icon";
import { FileIcon, isDownloadFileItem } from "./components/file-icon";
import { ShelfGridCard } from "./components/shelf-grid-card";
import {
  createCategory,
  copyDownloadPathsToClipboard,
  copyDownloadToClipboard,
  copyItemToClipboard,
  copyItemsToClipboard,
  deleteItem,
  exportItemForDrag,
  getContextualRecent,
  itemTypeLabel,
  listCategories,
  listItems,
  listRecentDownloads,
  openDownloadPath,
  openLibraryWindow,
  pasteDownloadByPath,
  pasteItemById,
  setNotchExpanded,
  setNotchHoverPreview,
  toggleFavorite,
} from "./lib/api";
import { getItemPeekLabel } from "./lib/item-label";
import { groupItemsByDate } from "./lib/date-groups";
import { applySettingsToDocument, DEFAULT_SETTINGS } from "./lib/settings";
import { useSettings } from "./lib/settings-context";
import { translateCategoryName, useI18n } from "./lib/i18n";
import { useUpdateStatus } from "./lib/update-status-context";
import { setFileDragData } from "./lib/drag-files";
import type { Category, ClipboardItem } from "./lib/types";
import { cn } from "./lib/utils";

interface NotchCopyFeedbackPayload {
  count: number;
  labels: string[];
  firstItemType: string;
  firstSourceApp?: string | null;
  message?: string;
}

export default function NotchShelf() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const { update, installing: installingUpdate, installNow } = useUpdateStatus();
  const [expanded, setExpanded] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [downloadsOnly, setDownloadsOnly] = useState(false);
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekItem, setPeekItem] = useState<ClipboardItem | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<NotchCopyFeedbackPayload | null>(null);
  const [notchHovered, setNotchHovered] = useState(false);
  const [hoverClosing, setHoverClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragPathsRef = useRef<Map<string, string[]>>(new Map());
  const visibleItemsRef = useRef<ClipboardItem[]>([]);
  const shelfOpen = expanded || notchHovered;
  const shelfVisible = shelfOpen || hoverClosing;
  const itemGroups = useMemo(() => groupItemsByDate(items), [items]);

  const refreshPeek = useCallback(async () => {
    const recent = await getContextualRecent(1);
    setPeekItem(recent[0] ?? null);
  }, []);

  const refreshMeta = useCallback(async () => {
    const cats = await listCategories();
    setCategories(cats);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      if (downloadsOnly) {
        const downloads = await listRecentDownloads(18);
        setItems(downloads);
        return;
      }
      const result = await listItems({
        categoryId: favoritesOnly ? undefined : activeCategory,
        favoritesOnly,
        limit: 18,
        offset: 0,
      });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, favoritesOnly, downloadsOnly]);

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

  const handleBatchCopy = useCallback(async () => {
    if (selected.size === 0) return;
    const orderedIds = items
      .filter((item) => selected.has(item.id))
      .map((item) => item.id);
    if (orderedIds.length === 0) return;
    if (downloadsOnly) {
      const filePaths = items
        .filter((item) => selected.has(item.id) && isDownloadItem(item))
        .map((item) => item.content);
      if (filePaths.length > 0) {
        await copyDownloadPathsToClipboard(filePaths);
      } else {
        const nonDownloadIds = items
          .filter((item) => selected.has(item.id) && !isDownloadItem(item))
          .map((item) => item.id);
        if (nonDownloadIds.length > 0) {
          await copyItemsToClipboard(nonDownloadIds);
        }
      }
    } else {
      await copyItemsToClipboard(orderedIds);
    }
    setSelected(new Set());
  }, [downloadsOnly, items, selected]);

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
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    };
  }, [refreshPeek]);

  useEffect(() => {
    visibleItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    function showFeedback(payload: NotchCopyFeedbackPayload) {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
      setCopyFeedback(payload);
      copyFeedbackTimerRef.current = setTimeout(() => {
        setCopyFeedback(null);
      }, 1450);
    }

    const unlistenCopied = listen<NotchCopyFeedbackPayload>(
      "notch-shelf:copy-feedback",
      (event) => {
        showFeedback(event.payload);
      },
    );

    function onLocalFeedback(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail || detail.startsWith("Copied")) return;
      showFeedback({
        count: 1,
        labels: [],
        firstItemType: "text",
        firstSourceApp: "ClipFlow",
        message: detail || t("copiedToClipboard"),
      });
    }
    window.addEventListener("clipflow:clipboard-feedback", onLocalFeedback);

    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
      window.removeEventListener("clipflow:clipboard-feedback", onLocalFeedback);
      unlistenCopied.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    setSelected(new Set());
  }, [activeCategory, favoritesOnly, downloadsOnly]);

  useEffect(() => {
    if (shelfOpen) loadItems();
  }, [activeCategory, favoritesOnly, downloadsOnly, shelfOpen, loadItems]);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (!settings.notchHoverEnabled) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && expanded) {
          void collapse();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [settings.notchHoverEnabled, expanded, collapse]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && shelfOpen) {
        event.preventDefault();
        void collapse();
      }
      if (
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
  }, [shelfOpen, selected.size, collapse, handleBatchCopy]);

  useEffect(() => {
    const unlistenExpanded = listen<boolean>("notch-shelf:expanded", (e) => {
      setExpanded(e.payload);
      if (!e.payload) {
        setNotchHovered(false);
        setHoverClosing(false);
        setSelected(new Set());
        refreshPeek();
      } else {
        setHoverClosing(false);
        refreshMeta();
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
          refreshMeta();
          loadItems();
          return;
        }
        setHoverClosing(true);
        setSelected(new Set());
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
      setSelected(new Set());
      refreshMeta();
      loadItems();
    });
    const unlistenNew = listen("clipboard:new-item", () => {
      refreshPeek();
      if (shelfOpen) loadItems();
      refreshMeta();
    });
    const unlistenCleared = listen("clipboard:history-cleared", () => {
      setPeekItem(null);
      setItems([]);
      setSelected(new Set());
      refreshMeta();
    });
    return () => {
      unlistenExpanded.then((fn) => fn());
      unlistenHoverPreview.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenNew.then((fn) => fn());
      unlistenCleared.then((fn) => fn());
    };
  }, [loadItems, refreshMeta, refreshPeek, shelfOpen]);

  function selectFavorites() {
    setFavoritesOnly((prev) => {
      const next = !prev;
      if (next) setActiveCategory(undefined);
      if (next) setDownloadsOnly(false);
      return next;
    });
  }

  function selectDownloads() {
    setFavoritesOnly(false);
    setActiveCategory(undefined);
    setDownloadsOnly(true);
  }

  function selectCategory(id: number) {
    setFavoritesOnly(false);
    setDownloadsOnly(false);
    const category = categories.find((cat) => cat.id === id);
    if (category?.name === "History") {
      setActiveCategory(undefined);
      return;
    }
    setActiveCategory((prev) => (prev === id ? undefined : id));
  }

  async function handlePaste(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (settings.notchHoverEnabled) {
      await collapse();
    } else {
      await getCurrentWindow().hide();
      setExpanded(false);
    }
    if (downloadsOnly && item && isDownloadItem(item)) {
      await pasteDownloadByPath(item.content);
    } else {
      await pasteItemById(id);
    }
  }

  async function handlePrimaryAction(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (downloadsOnly && item && isDownloadItem(item)) {
      await openDownloadPath(item.content);
      return;
    }
    await handleCopy(id);
  }

  async function handleCopy(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (downloadsOnly && item && isDownloadItem(item)) {
      await copyDownloadToClipboard(item.content, "Copied download");
    } else {
      await copyItemToClipboard(
        id,
        item ? `Copied ${itemTypeLabel(item.itemType).toLowerCase()}` : undefined,
      );
    }
  }

  function isDownloadItem(item: ClipboardItem) {
    return item.id.startsWith("download:") || item.categoryId === -2;
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

  function prepareDragItem(item: ClipboardItem) {
    if (isDownloadItem(item)) {
      dragPathsRef.current.set(item.id, [item.content]);
      return;
    }

    void exportItemForDrag(item.id)
      .then((paths) => {
        if (paths.length > 0) {
          dragPathsRef.current.set(item.id, paths);
        }
      })
      .catch(() => {
        dragPathsRef.current.delete(item.id);
      });
  }

  function handleDragStart(item: ClipboardItem, event: DragEvent<HTMLElement>) {
    const paths = dragPathsRef.current.get(item.id);
    if (!paths?.length) {
      event.preventDefault();
      void exportItemForDrag(item.id)
        .then((nextPaths) => {
          if (nextPaths.length > 0) {
            dragPathsRef.current.set(item.id, nextPaths);
          }
        })
        .catch(() => undefined);
      return;
    }
    setFileDragData(event.dataTransfer, paths);
  }

  function handleDragEnd() {
    dragPathsRef.current.clear();
  }

  async function handleFavorite(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item && isDownloadItem(item)) return;
    await toggleFavorite(id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
      ),
    );
    refreshMeta();
  }

  async function handleDelete(id: string) {
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    refreshMeta();
    refreshPeek();
  }

  async function handleOpenLibrary() {
    await openLibraryWindow();
  }

  async function handleInstallUpdate() {
    if (!update?.version || installingUpdate) return;
    const confirmed = window.confirm(
      t("installUpdateConfirm", { version: update.version }),
    );
    if (!confirmed) return;
    await installNow();
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
    refreshMeta();
  }

  return (
    <div
      className="notch-root flex h-full w-full flex-col items-center overflow-hidden"
      onMouseEnter={handleShelfMouseEnter}
      onMouseLeave={handleShelfMouseLeave}
    >
      {!shelfVisible && copyFeedback && (
        <NotchCopyFeedback feedback={copyFeedback} />
      )}
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
            updateVersion={update?.version}
            installingUpdate={installingUpdate}
            onInstallUpdate={handleInstallUpdate}
            className="notch-rail-enter"
          />
          {shelfVisible && copyFeedback && (
            <NotchInlineFeedback feedback={copyFeedback} />
          )}

          {selected.size > 0 && (
            <div className="notch-actions-enter flex min-h-10 items-center justify-end gap-2 px-6 pt-3 pb-2.5">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleBatchCopy();
                }}
                className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-bold text-black shadow-[0_8px_24px_rgba(255,255,255,0.16)] transition-transform hover:scale-[1.02]"
                title="⌘C / Ctrl+C"
              >
                <Copy size={14} />
                {t("copySelected")}
              </button>
            </div>
          )}

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
              {t("favorites")}
            </FilterChip>
            <FilterChip
              active={downloadsOnly}
              onClick={selectDownloads}
              icon={<Download size={12} />}
            >
              {t("downloads")}
            </FilterChip>
            {categories.map((cat) => (
              <FilterChip
                key={cat.id}
                active={
                  !downloadsOnly &&
                  !favoritesOnly &&
                  (cat.name === "History"
                    ? activeCategory === undefined
                    : activeCategory === cat.id)
                }
                onClick={() => selectCategory(cat.id)}
              >
                {translateCategoryName(settings.language, cat.name)}
                {cat.itemCount > 0 && (
                  <span className="ml-1 opacity-50">{cat.itemCount}</span>
                )}
              </FilterChip>
            ))}
            <button
              type="button"
              onClick={handleCreateCategory}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.09] text-white/62 transition-colors hover:bg-white/[0.14] hover:text-white/85"
              aria-label={t("newCategory")}
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="notch-groups-enter min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6 scrollbar-thin">
            {loading && items.length === 0 && (
              <p className="py-8 text-center text-[12px] text-white/35">
                {t("loadingMore")}
              </p>
            )}
            {!loading && items.length === 0 && (
              <p className="py-8 text-center text-[12px] text-white/35">
                {settings.capturePaused ? t("emptyPausedTitle") : t("emptyTitle")}
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
                          selected={selected.has(item.id)}
                          onPaste={handlePaste}
                          onCopy={handleCopy}
                          onPrimaryAction={handlePrimaryAction}
                          onFavorite={handleFavorite}
                          onDelete={handleDelete}
                          onToggleSelect={handleToggleSelect}
                          onPrepareDrag={prepareDragItem}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
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

function NotchCopyFeedback({ feedback }: { feedback: NotchCopyFeedbackPayload }) {
  const label = `${feedback.count} ${
    feedback.count === 1 ? "item" : "items"
  }`;
  const details = feedback.labels.filter(Boolean).join(", ");
  const message = feedback.message ?? label;

  return (
    <div
      aria-live="polite"
      className="notch-copy-feedback pointer-events-none flex h-full w-full items-end justify-center bg-black px-4 pb-3"
    >
      <div className="flex min-w-0 max-w-[320px] items-center gap-2">
        {feedback.firstSourceApp ? (
          <AppIcon appName={feedback.firstSourceApp} size="sm" />
        ) : (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-white/[0.92] text-black">
            <Copy size={11} strokeWidth={2.4} />
          </span>
        )}
        <p className="min-w-0 truncate text-[12px] font-semibold tracking-tight text-white/88">
          {message}
          {!feedback.message && details && (
            <span className="text-white/62"> · {details}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function NotchInlineFeedback({ feedback }: { feedback: NotchCopyFeedbackPayload }) {
  const label = `${feedback.count} ${
    feedback.count === 1 ? "item" : "items"
  }`;
  const details = feedback.labels.filter(Boolean).join(", ");
  const message = feedback.message ?? label;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-6"
    >
      <div className="flex max-w-[360px] items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px] font-bold text-black shadow-[0_14px_36px_rgba(0,0,0,0.34)] ring-1 ring-white/50">
        {feedback.firstSourceApp ? (
          <AppIcon appName={feedback.firstSourceApp} size="sm" />
        ) : (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-black text-white">
            <Copy size={11} strokeWidth={2.4} />
          </span>
        )}
        <span className="min-w-0 truncate">
          {message}
          {!feedback.message && details && (
            <span className="text-black/56"> · {details}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function NotchHoverRail({
  item,
  onOpen,
  onOpenLibrary,
  updateVersion,
  installingUpdate,
  onInstallUpdate,
  className,
}: {
  item: ClipboardItem | null;
  onOpen?: () => void;
  onOpenLibrary?: () => void;
  updateVersion?: string;
  installingUpdate?: boolean;
  onInstallUpdate?: () => void;
  className?: string;
}) {
  const { t } = useI18n();

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
        {updateVersion && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onInstallUpdate?.();
            }}
            disabled={installingUpdate}
            className="flex h-6 items-center gap-1 rounded-full bg-amber-300 px-2 text-[10px] font-bold text-black ring-1 ring-amber-100/60 transition-colors hover:bg-amber-200 disabled:cursor-default disabled:opacity-70"
            aria-label={t("versionAvailable", { version: updateVersion })}
            title={t("versionAvailable", { version: updateVersion })}
          >
            <CircleArrowUp size={13} />
            <span>{installingUpdate ? t("installing") : updateVersion}</span>
          </button>
        )}
        {onOpenLibrary && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenLibrary();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.10] text-white/70 transition-colors hover:bg-white/[0.18] hover:text-white"
            aria-label={t("openSettings")}
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
  if (isDownloadFileItem(item)) {
    return <FileIcon item={item} size="sm" />;
  }

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
      ) : isDownloadFileItem(item) ? (
        <FileIcon item={item} size="sm" />
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
