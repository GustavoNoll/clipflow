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
  X,
} from "lucide-react";
import { AppIcon } from "./components/app-icon";
import { FileIcon, isDownloadFileItem } from "./components/file-icon";
import { ShelfGridCard } from "./components/shelf-grid-card";
import {
  createCategory,
  copyDownloadPathsToClipboard,
  copyDownloadToClipboard,
  copyFilePathsToClipboard,
  copyItemToClipboard,
  copyItemsToClipboard,
  deleteItem,
  fileItemsFromPaths,
  getContextualRecent,
  itemTypeLabel,
  listCategories,
  listItems,
  listRecentDownloads,
  openLibraryWindow,
  pasteDownloadByPath,
  pasteFileByPath,
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
import type { Category, ClipboardItem } from "./lib/types";
import { cn } from "./lib/utils";

interface NotchCopyFeedbackPayload {
  count: number;
  labels: string[];
  firstItemType: string;
  firstSourceApp?: string | null;
}

interface TauriFileDropPayload {
  paths?: string[];
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
  const [benchOnly, setBenchOnly] = useState(false);
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekItem, setPeekItem] = useState<ClipboardItem | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<NotchCopyFeedbackPayload | null>(null);
  const [notchHovered, setNotchHovered] = useState(false);
  const [hoverClosing, setHoverClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [benchItems, setBenchItems] = useState<ClipboardItem[]>([]);
  const [benchDropActive, setBenchDropActive] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggedItemRef = useRef<ClipboardItem | null>(null);
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
      if (benchOnly) {
        setItems(benchItems);
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
  }, [activeCategory, favoritesOnly, downloadsOnly, benchOnly, benchItems]);

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
    if (downloadsOnly || benchOnly) {
      const filePaths = items
        .filter((item) => selected.has(item.id) && isFileBackedItem(item))
        .map((item) => item.content);
      if (filePaths.length > 0) {
        if (downloadsOnly) {
          await copyDownloadPathsToClipboard(filePaths);
        } else {
          await copyFilePathsToClipboard(filePaths);
        }
      } else {
        const nonDownloadIds = items
          .filter((item) => selected.has(item.id) && !isFileBackedItem(item))
          .map((item) => item.id);
        if (nonDownloadIds.length > 0) {
          await copyItemsToClipboard(nonDownloadIds);
        }
      }
    } else {
      await copyItemsToClipboard(orderedIds);
    }
    setSelected(new Set());
  }, [downloadsOnly, benchOnly, items, selected]);

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
      if (dragCleanupTimerRef.current) clearTimeout(dragCleanupTimerRef.current);
    };
  }, [refreshPeek]);

  useEffect(() => {
    visibleItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    function cleanupDragState() {
      if (dragCleanupTimerRef.current) {
        clearTimeout(dragCleanupTimerRef.current);
        dragCleanupTimerRef.current = null;
      }
      draggedItemRef.current = null;
      setBenchDropActive(false);
    }

    window.addEventListener("dragend", cleanupDragState);
    return () => {
      window.removeEventListener("dragend", cleanupDragState);
    };
  }, []);

  useEffect(() => {
    const unlistenDragEnter = listen<TauriFileDropPayload>(
      "tauri://drag-enter",
      (event) => {
        if (event.payload.paths?.length) revealBenchDropTarget();
      },
    );
    const unlistenDragOver = listen<TauriFileDropPayload>(
      "tauri://drag-over",
      (event) => {
        if (event.payload.paths?.length) revealBenchDropTarget();
      },
    );
    const unlistenDragLeave = listen("tauri://drag-leave", () => {
      if (!draggedItemRef.current) setBenchDropActive(false);
    });
    const unlistenDrop = listen<TauriFileDropPayload>(
      "tauri://drag-drop",
      (event) => {
        setBenchDropActive(false);
        if (event.payload.paths?.length) {
          void addBenchPaths(event.payload.paths);
        }
      },
    );

    return () => {
      unlistenDragEnter.then((fn) => fn());
      unlistenDragOver.then((fn) => fn());
      unlistenDragLeave.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [benchOnly]);

  useEffect(() => {
    const unlistenCopied = listen<NotchCopyFeedbackPayload>(
      "notch-shelf:copy-feedback",
      (event) => {
        if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
        setCopyFeedback(event.payload);
        copyFeedbackTimerRef.current = setTimeout(() => {
          setCopyFeedback(null);
        }, 1450);
      },
    );

    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
      unlistenCopied.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [activeCategory, favoritesOnly, downloadsOnly, benchOnly]);

  useEffect(() => {
    if (shelfOpen) loadItems();
  }, [activeCategory, favoritesOnly, downloadsOnly, benchOnly, shelfOpen, loadItems]);

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
      if (next) setBenchOnly(false);
      return next;
    });
  }

  function selectDownloads() {
    setDownloadsOnly((prev) => {
      const next = !prev;
      if (next) {
        setFavoritesOnly(false);
        setBenchOnly(false);
        setActiveCategory(undefined);
      }
      return next;
    });
  }

  function selectBench() {
    setBenchOnly((prev) => {
      const next = !prev;
      if (next) {
        setFavoritesOnly(false);
        setDownloadsOnly(false);
        setActiveCategory(undefined);
      }
      return next;
    });
  }

  function selectCategory(id: number) {
    setFavoritesOnly(false);
    setDownloadsOnly(false);
    setBenchOnly(false);
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
    if ((downloadsOnly || benchOnly) && item && isFileBackedItem(item)) {
      if (isDownloadItem(item)) {
        await pasteDownloadByPath(item.content);
      } else {
        await pasteFileByPath(item.content);
      }
    } else {
      await pasteItemById(id);
    }
  }

  async function handleCopy(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if ((downloadsOnly || benchOnly) && item && isFileBackedItem(item)) {
      if (isDownloadItem(item)) {
        await copyDownloadToClipboard(item.content, "Copied download");
      } else {
        await copyFilePathsToClipboard([item.content], "Copied file");
      }
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

  function isFileBackedItem(item: ClipboardItem) {
    return isDownloadItem(item) || item.id.startsWith("file:") || item.itemType === "file";
  }

  function addBenchItem(item: ClipboardItem) {
    addBenchItems([item]);
  }

  function addBenchItems(nextItems: ClipboardItem[]) {
    setBenchItems((prev) => {
      const nextIds = new Set(nextItems.map((item) => item.id));
      const withoutDuplicate = prev.filter((candidate) => !nextIds.has(candidate.id));
      return [...nextItems, ...withoutDuplicate].slice(0, 6);
    });
    if (benchOnly) {
      setItems((prev) => {
        const nextIds = new Set(nextItems.map((item) => item.id));
        const withoutDuplicate = prev.filter((candidate) => !nextIds.has(candidate.id));
        return [...nextItems, ...withoutDuplicate].slice(0, 6);
      });
    }
  }

  async function addBenchPaths(paths: string[]) {
    const fileItems = await fileItemsFromPaths(paths);
    if (fileItems.length > 0) addBenchItems(fileItems);
  }

  function revealBenchDropTarget() {
    cancelLeaveTimer();
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setHoverClosing(false);
    setNotchHovered(true);
    setBenchDropActive(true);
    void setNotchHoverPreview(true);
  }

  function removeBenchItem(id: string) {
    setBenchItems((prev) => prev.filter((item) => item.id !== id));
    if (benchOnly) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  }

  function clearBench() {
    setBenchItems([]);
    if (benchOnly) {
      setItems([]);
    }
  }

  function handleCardDragStart(item: ClipboardItem, event: DragEvent<HTMLElement>) {
    if (dragCleanupTimerRef.current) {
      clearTimeout(dragCleanupTimerRef.current);
      dragCleanupTimerRef.current = null;
    }
    draggedItemRef.current = item;
    setBenchDropActive(true);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-clipflow-item-id", item.id);
    event.dataTransfer.setData("text/plain", item.preview);
  }

  function handleCardDragEnd() {
    if (dragCleanupTimerRef.current) clearTimeout(dragCleanupTimerRef.current);
    dragCleanupTimerRef.current = setTimeout(() => {
      draggedItemRef.current = null;
      setBenchDropActive(false);
      dragCleanupTimerRef.current = null;
    }, 120);
  }

  function handleBenchDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedItemRef.current && !hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setBenchDropActive(true);
  }

  function handleShelfDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedItemRef.current && !hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setBenchDropActive(true);
  }

  function handleBenchDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const filePaths = filePathsFromDataTransfer(event.dataTransfer);
    if (filePaths.length > 0) {
      void addBenchPaths(filePaths);
      setBenchDropActive(false);
      return;
    }
    const draggedId = event.dataTransfer.getData("application/x-clipflow-item-id");
    const item =
      draggedItemRef.current ??
      visibleItemsRef.current.find((candidate) => candidate.id === draggedId) ??
      benchItems.find((candidate) => candidate.id === draggedId);
    if (dragCleanupTimerRef.current) {
      clearTimeout(dragCleanupTimerRef.current);
      dragCleanupTimerRef.current = null;
    }
    draggedItemRef.current = null;
    setBenchDropActive(false);
    if (item) addBenchItem(item);
  }

  function handleShelfDrop(event: DragEvent<HTMLElement>) {
    if (!draggedItemRef.current && !hasFileDrag(event)) return;
    handleBenchDrop(event);
  }

  async function handleBenchCopy(item: ClipboardItem) {
    if (isDownloadItem(item)) {
      await copyDownloadToClipboard(item.content, "Copied download");
      return;
    }
    if (isFileBackedItem(item)) {
      await copyFilePathsToClipboard([item.content], "Copied file");
      return;
    }
    await copyItemToClipboard(
      item.id,
      `Copied ${itemTypeLabel(item.itemType).toLowerCase()}`,
    );
  }

  async function handleBenchPaste(item: ClipboardItem) {
    if (settings.notchHoverEnabled) {
      await collapse();
    } else {
      await getCurrentWindow().hide();
      setExpanded(false);
    }
    if (isDownloadItem(item)) {
      await pasteDownloadByPath(item.content);
      return;
    }
    if (isFileBackedItem(item)) {
      await pasteFileByPath(item.content);
      return;
    }
    await pasteItemById(item.id);
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
    const item = items.find((candidate) => candidate.id === id);
    if (item && isFileBackedItem(item)) {
      removeBenchItem(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    removeBenchItem(id);
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
          onDragOver={handleShelfDragOver}
          onDrop={handleShelfDrop}
        >
          <NotchHoverRail
            item={peekItem}
            onOpenLibrary={handleOpenLibrary}
            updateVersion={update?.version}
            installingUpdate={installingUpdate}
            onInstallUpdate={handleInstallUpdate}
            className="notch-rail-enter"
          />

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

          {(benchItems.length > 0 || benchDropActive) && (
            <NotchBench
              items={benchItems}
              dropActive={benchDropActive}
              onDragOver={handleBenchDragOver}
              onDragLeave={() => setBenchDropActive(Boolean(draggedItemRef.current))}
              onDrop={handleBenchDrop}
              onCopy={handleBenchCopy}
              onPaste={handleBenchPaste}
              onRemove={removeBenchItem}
              onClear={clearBench}
            />
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
              active={benchOnly}
              onClick={selectBench}
              icon={<Grid3X3 size={12} />}
            >
              {t("notchBench")}
              {benchItems.length > 0 && (
                <span className="ml-1 opacity-50">{benchItems.length}</span>
              )}
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
                  !benchOnly &&
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
                {benchOnly
                  ? t("notchBenchHint")
                  : settings.capturePaused
                    ? t("emptyPausedTitle")
                    : t("emptyTitle")}
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
                          onFavorite={handleFavorite}
                          onDelete={handleDelete}
                          onToggleSelect={handleToggleSelect}
                          onDragStart={handleCardDragStart}
                          onDragEnd={handleCardDragEnd}
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
          {label}
          {details && <span className="text-white/62"> · {details}</span>}
        </p>
      </div>
    </div>
  );
}

function hasFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).some((type) =>
    ["Files", "text/uri-list", "public.file-url"].includes(type),
  );
}

function filePathsFromDataTransfer(dataTransfer: DataTransfer) {
  const uriList = dataTransfer.getData("text/uri-list");
  if (!uriList) return [];
  return uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => line.startsWith("file://"))
    .map((line) => decodeURIComponent(line.replace(/^file:\/\//, "")));
}

function NotchBench({
  items,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onCopy,
  onPaste,
  onRemove,
  onClear,
}: {
  items: ClipboardItem[];
  dropActive: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onCopy: (item: ClipboardItem) => void;
  onPaste: (item: ClipboardItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <section
      className="notch-bench-enter px-6 pb-3"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={t("notchBench")}
    >
      <div
        className={cn(
          "flex min-h-11 items-center gap-2 overflow-hidden rounded-[16px] border px-2.5 py-2 transition-[background-color,border-color,transform] duration-200",
          dropActive
            ? "border-white/35 bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "border-white/[0.08] bg-white/[0.055]",
        )}
      >
        <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-white/50">
          {t("notchBench")}
        </span>
        {items.length === 0 ? (
          <p className="truncate text-[12px] font-medium text-white/44">
            {dropActive ? t("dropToBench") : t("notchBenchHint")}
          </p>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group flex max-w-[210px] shrink-0 items-center rounded-full bg-white/[0.09] text-white/76 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.14] hover:text-white"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      void onCopy(item);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      void onPaste(item);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 pr-1 text-left"
                    title={`${t("copyToClipboard")} · ${t("paste")}`}
                  >
                    {isDownloadFileItem(item) ? (
                      <FileIcon item={item} size="sm" />
                    ) : (
                      <AppIcon appName={item.sourceApp} size="sm" />
                    )}
                    <span className="truncate text-[11px] font-semibold">
                      {getItemPeekLabel(item)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/34 transition-colors hover:bg-white/[0.12] hover:text-white/80"
                    aria-label={t("removeFromBench")}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-white/38 transition-colors hover:bg-white/[0.08] hover:text-white/70"
            >
              {t("clear")}
            </button>
          </>
        )}
      </div>
    </section>
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
