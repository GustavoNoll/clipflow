import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SIDEBAR_STORAGE_KEY = "clipflow.sidebarOpen";
import {
  CircleArrowUp,
  ClipboardList,
  Copy,
  Download,
  FolderOpen,
  Heart,
  MousePointer2,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppLogo } from "./components/app-logo";
import { AppIcon } from "./components/app-icon";
import { ClipCard } from "./components/clip-card";
import { ClipboardFeedback } from "./components/clipboard-feedback";
import { SettingsPanel } from "./components/settings-panel";
import {
  applyFirstSearchFilterSuggestion,
  hasSearchFilterSuggestion,
  SearchFilterSuggestions,
} from "./components/search-filter-suggestions";
import { ShortcutsReference } from "./components/shortcuts-reference";
import {
  clearHistory,
  copyDownloadPathsToClipboard,
  copyDownloadToClipboard,
  copyItemToClipboard,
  copyItemsToClipboard,
  createCategory,
  deleteItem,
  deleteItems,
  listCategories,
  listItems,
  listRecentDownloads,
  listSourceApps,
  pasteDownloadByPath,
  pasteItemById,
  seedDemoData,
  setItemsFavorite,
  setItemsPinned,
  setPinShortcut,
  toggleFavorite,
} from "./lib/api";
import { LANGUAGE_OPTIONS, translateCategoryName, useI18n, type Language } from "./lib/i18n";
import { useSettings } from "./lib/settings-context";
import { useUpdateStatus } from "./lib/update-status-context";
import type { Category, ClipboardItem, ItemType, SourceApp } from "./lib/types";
import { cn } from "./lib/utils";

type FilterView = "all" | "favorites" | "downloads" | "category" | "app" | "type";

export default function App() {
  const { settings, updateSettings, loaded } = useSettings();
  const { update } = useUpdateStatus();
  const { t } = useI18n();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sourceApps, setSourceApps] = useState<SourceApp[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [view, setView] = useState<FilterView>("all");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [sourceApp, setSourceApp] = useState<string | undefined>();
  const [itemType, setItemType] = useState<ItemType | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshMeta = useCallback(async () => {
    const [cats, apps] = await Promise.all([
      listCategories(),
      listSourceApps(),
    ]);
    setCategories(cats);
    setSourceApps(apps);
  }, []);

  const loadItems = useCallback(
    async (reset = false) => {
      setLoading(true);
      const nextOffset = reset ? 0 : offset;
      try {
        if (view === "downloads") {
          const downloads = await listRecentDownloads(80);
          const normalizedQuery = debouncedQuery.trim().toLowerCase();
          const filtered = normalizedQuery
            ? downloads.filter((item) =>
                `${item.preview} ${item.content}`.toLowerCase().includes(normalizedQuery),
              )
            : downloads;
          setItems(filtered);
          setTotal(filtered.length);
          setHasMore(false);
          setOffset(filtered.length);
          return;
        }
        const result = await listItems({
          query: debouncedQuery || undefined,
          categoryId: view === "category" ? categoryId : undefined,
          sourceApp: view === "app" ? sourceApp : undefined,
          itemType: view === "type" ? itemType : undefined,
          favoritesOnly: view === "favorites",
          limit: 40,
          offset: nextOffset,
        });
        setItems((prev) => (reset ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setHasMore(result.hasMore);
        setOffset(nextOffset + result.items.length);
      } finally {
        setLoading(false);
      }
    },
    [debouncedQuery, view, categoryId, sourceApp, itemType, offset],
  );

  const handleBatchDelete = useCallback(async () => {
    if (selected.size === 0) return;
    await deleteItems([...selected]);
    setItems((prev) => prev.filter((item) => !selected.has(item.id)));
    setSelected(new Set());
    refreshMeta();
  }, [selected, refreshMeta]);

  const handleBatchFavorite = useCallback(async () => {
    if (selected.size === 0) return;
    await setItemsFavorite([...selected], true);
    setItems((prev) =>
      prev.map((item) =>
        selected.has(item.id) ? { ...item, isFavorite: true } : item,
      ),
    );
    refreshMeta();
  }, [selected, refreshMeta]);

  const handleBatchPin = useCallback(async () => {
    if (selected.size === 0) return;
    await setItemsPinned([...selected], true);
    setItems((prev) =>
      prev.map((item) =>
        selected.has(item.id) ? { ...item, isPinned: true } : item,
      ),
    );
    refreshMeta();
  }, [selected, refreshMeta]);

  const handleBatchCopy = useCallback(async () => {
    if (selected.size === 0) return;
    const orderedItems = items.filter((item) => selected.has(item.id));
    if (view === "downloads") {
      await copyDownloadPathsToClipboard(orderedItems.map((item) => item.content));
      return;
    }
    await copyItemsToClipboard(orderedItems.map((item) => item.id));
  }, [items, selected, view]);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setItems([]);
    setSelected(new Set());
    setTotal(0);
    setHasMore(false);
    setOffset(0);
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOffset(0);
    loadItems(true);
  }, [debouncedQuery, view, categoryId, sourceApp, itemType]);

  useEffect(() => {
    const unlisten = listen<string>("clipboard:new-item", () => {
      refreshMeta();
      setOffset(0);
      loadItems(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadItems, refreshMeta]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const unlisteners = [
      listen("menu:open-settings", () => setSettingsOpen(true)),
      listen("menu:clear-history", () => {
        void handleClearHistory();
      }),
      listen("menu:focus-search", () => {
        searchRef.current?.focus();
        searchRef.current?.select();
      }),
      listen("menu:toggle-sidebar", () => {
        setSidebarOpen((open) => !open);
      }),
    ];
    return () => {
      unlisteners.forEach((promise) => {
        promise.then((fn) => fn());
      });
    };
  }, [handleClearHistory]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey;

      if (meta && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (meta && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (meta && event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }

      if (
        meta &&
        event.key.toLowerCase() === "c" &&
        selected.size > 0 &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        void handleBatchCopy();
        return;
      }

      if (event.key === "Escape") {
        if (settingsOpen) {
          event.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if (
        view !== "downloads" &&
        (event.key === "Delete" || (event.key === "Backspace" && meta)) &&
        selected.size > 0 &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        void handleBatchDelete();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size, settingsOpen, view, handleBatchCopy, handleBatchDelete]);

  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          loadItems(false);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadItems]);

  const typeFilters = useMemo(
    () =>
      ([
        ["text", "typeText"],
        ["url", "typeUrl"],
        ["code", "typeCode"],
        ["image", "typeImage"],
        ["file", "typeFile"],
        ["color", "typeColor"],
        ["bundle", "typeBundle"],
      ] as const).map(([id, key]) => ({ id: id as ItemType, label: t(key) })),
    [t],
  );

  async function handleFavorite(id: string) {
    await toggleFavorite(id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
      ),
    );
    refreshMeta();
  }

  async function handlePin(id: string, pinned: boolean) {
    await setItemsPinned([id], pinned);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              isPinned: pinned,
              pinShortcut: pinned ? item.pinShortcut : null,
            }
          : item,
      ),
    );
    refreshMeta();
  }

  async function handlePinShortcut(id: string, shortcut: number | null) {
    await setPinShortcut(id, shortcut);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isPinned: item.id === id ? true : item.isPinned,
        pinShortcut:
          item.id === id
            ? shortcut
            : item.pinShortcut === shortcut
              ? null
              : item.pinShortcut,
      })),
    );
    refreshMeta();
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

  async function handleDelete(id: string) {
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    refreshMeta();
  }

  async function handlePaste(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (view === "downloads" && item) {
      await pasteDownloadByPath(item.content);
      return;
    }
    await pasteItemById(id);
  }

  async function handleCopy(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (view === "downloads" && item) {
      await copyDownloadToClipboard(item.content, t("copiedToClipboard"));
      return;
    }
    await copyItemToClipboard(
      id,
      item ? t("copiedToClipboard") : undefined,
    );
  }

  async function handleIgnoreApp(appName: string) {
    if (settings.ignoredSourceApps.includes(appName)) return;
    await updateSettings({
      ignoredSourceApps: [...settings.ignoredSourceApps, appName],
    });
    window.dispatchEvent(
      new CustomEvent("clipflow:clipboard-feedback", {
        detail: t("ignoringApp", { app: appName }),
      }),
    );
  }

  async function handleCreateCategory() {
    const name = prompt(t("categoryNamePrompt"));
    if (!name?.trim()) return;
    await createCategory(name.trim());
    refreshMeta();
  }

  async function toggleCapturePause() {
    if (settings.capturePaused) {
      await updateSettings({ capturePaused: false, capturePausedUntil: null });
    } else {
      await updateSettings({
        capturePaused: true,
        capturePausedUntil: Math.floor(Date.now() / 1000) + 15 * 60,
      });
    }
  }

  const gridClass = settings.compactGrid
    ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="flex h-full flex-col bg-transparent">
      <ClipboardFeedback variant="light" position="bottom" />
      <header
        data-tauri-drag-region
        className="glass-toolbar flex items-center justify-between border-b px-5 py-3.5 pt-10"
      >
        <div className="flex items-center gap-3">
          <AppLogo />
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-[var(--color-text)]">
              ClipFlow
            </h1>
            <p className="text-label">
              {total.toLocaleString()} {total === 1 ? t("item") : t("items")}
              {settings.capturePaused && ` · ${t("capturePaused")}`}
              {settings.ignoredSourceApps.length > 0 &&
                ` · ${settings.ignoredSourceApps.length} ${
                  settings.ignoredSourceApps.length === 1 ? t("ignoredApp") : t("ignoredApps")
                }`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleCapturePause}
            className={cn(
              "btn-ghost",
              settings.capturePaused &&
                "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
            )}
          >
            {settings.capturePaused ? t("resumeCapture") : t("pause15m")}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-label px-2">
                {t("selectedCount", { count: selected.size })}
              </span>
              <button type="button" onClick={handleBatchCopy} className="btn-ghost">
                <Copy size={15} />
                {t("copySelected")}
              </button>
              {view !== "downloads" && (
                <>
                  <button type="button" onClick={handleBatchFavorite} className="btn-ghost">
                    <Heart size={15} />
                    {t("favoriteSelected")}
                  </button>
                  <button type="button" onClick={handleBatchPin} className="btn-ghost">
                    {t("pinSelected")}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="btn-ghost text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
                  >
                    <Trash2 size={15} />
                    {t("deleteCount", { count: selected.size })}
                  </button>
                </>
              )}
            </>
          )}
          {update && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn-ghost border border-amber-400/30 bg-amber-400/12 text-amber-700 shadow-[0_8px_22px_rgba(251,191,36,0.14)] hover:bg-amber-400/18"
              title={t("versionAvailable", { version: update.version })}
            >
              <CircleArrowUp size={15} />
              {t("updateAvailable")}
            </button>
          )}
          <button type="button" onClick={handleClearHistory} className="btn-ghost">
            {t("clearAll")}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              "btn-ghost relative h-9 w-9 p-0",
              update && "text-amber-700 ring-1 ring-amber-400/25",
            )}
            aria-label={t("openSettings")}
            title={update ? t("versionAvailable", { version: update.version }) : t("openSettings")}
          >
            <Settings size={16} />
            {update && (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--color-surface)]" />
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
        <aside className="glass-toolbar w-56 shrink-0 overflow-y-auto border-r p-3">
          <nav className="space-y-0.5">
            <SidebarButton
              active={view === "all"}
              icon={<ClipboardList size={15} />}
              label={t("allHistory")}
              count={total}
              onClick={() => {
                setView("all");
                setCategoryId(undefined);
              }}
            />
            <SidebarButton
              active={view === "favorites"}
              icon={<Heart size={15} />}
              label={t("favorites")}
              onClick={() => setView("favorites")}
            />
            <SidebarButton
              active={view === "downloads"}
              icon={<Download size={15} />}
              label={t("downloads")}
              count={view === "downloads" ? total : undefined}
              onClick={() => {
                setView("downloads");
                setCategoryId(undefined);
                setSourceApp(undefined);
                setItemType(undefined);
              }}
            />
          </nav>

          <NavSection title={t("categories")}>
            {categories.map((cat) => (
              <SidebarButton
                key={cat.id}
                active={view === "category" && categoryId === cat.id}
                label={translateCategoryName(settings.language, cat.name)}
                count={cat.itemCount}
                onClick={() => {
                  setView("category");
                  setCategoryId(cat.id);
                }}
              />
            ))}
            <button
              type="button"
              onClick={handleCreateCategory}
              className="btn-ghost mt-1 w-full justify-start px-3 py-2 text-xs"
            >
              <Plus size={14} />
              {t("newCategory")}
            </button>
          </NavSection>

          {sourceApps.length > 0 && (
            <NavSection title={t("byApp")}>
              {sourceApps.slice(0, 10).map((app) => (
                <SidebarButton
                  key={app.name}
                  active={view === "app" && sourceApp === app.name}
                  icon={<AppIcon appName={app.name} size="xs" />}
                  label={app.name}
                  count={app.count}
                  onClick={() => {
                    setView("app");
                    setSourceApp(app.name);
                  }}
                />
              ))}
            </NavSection>
          )}

          <NavSection title={t("byType")}>
            {typeFilters.map((t) => (
              <SidebarButton
                key={t.id}
                active={view === "type" && itemType === t.id}
                label={t.label}
                onClick={() => {
                  setView("type");
                  setItemType(t.id);
                }}
              />
            ))}
          </NavSection>

          <div className="mt-5">
            <ShortcutsReference settings={settings} variant="compact" />
          </div>
        </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {settings.capturePaused && (
            <div className="border-b border-[var(--color-danger-subtle)] bg-[var(--color-danger-subtle)] px-5 py-2 text-[12px] font-medium text-[var(--color-danger)] backdrop-blur-md">
              {t("pausedBanner")}
            </div>
          )}
          <div className="glass-toolbar border-b px-5 py-3.5">
            <div className="relative max-w-xl">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                ref={searchRef}
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
                placeholder={t("searchLibrary")}
                className="input-field pl-9"
                aria-label={t("searchLibraryAria")}
              />
              <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                {t("searchFilterHint")}
              </p>
              <SearchFilterSuggestions
                query={query}
                sourceApps={sourceApps}
                onApply={(nextQuery) => {
                  setQuery(nextQuery);
                  searchRef.current?.focus();
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {items.length === 0 && loading ? (
              <LoadingGrid compact={settings.compactGrid} />
            ) : items.length === 0 ? (
              <EmptyState capturePaused={settings.capturePaused} />
            ) : (
              <div className={cn("grid gap-3", gridClass)}>
                {items.map((item) => (
                  <ClipCard
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onFavorite={view === "downloads" ? undefined : handleFavorite}
                    onDelete={view === "downloads" ? undefined : handleDelete}
                    onPaste={handlePaste}
                    onCopy={handleCopy}
                    onIgnoreApp={handleIgnoreApp}
                    onPin={view === "downloads" ? undefined : handlePin}
                    onSetPinShortcut={view === "downloads" ? undefined : handlePinShortcut}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            )}
            <div
              ref={loaderRef}
              className="py-6 text-center text-sm text-[var(--color-text-muted)]"
            >
              {items.length > 0 && loading ? t("loadingMore") : hasMore ? t("scrollForMore") : null}
            </div>
          </div>
        </main>
      </div>

      {loaded && !settings.hasSelectedLanguage && (
        <LanguageDialog
          onSelect={(language) => {
            void updateSettings({ language, hasSelectedLanguage: true });
          }}
        />
      )}

      {loaded && settings.hasSelectedLanguage && !settings.hasCompletedOnboarding && (
        <OnboardingDialog
          onEnableNotch={async () => {
            await updateSettings({
              notchHoverEnabled: true,
              hasCompletedOnboarding: true,
            });
          }}
          onAddDemo={async () => {
            await seedDemoData();
            await updateSettings({ hasCompletedOnboarding: true });
            refreshMeta();
            setOffset(0);
            loadItems(true);
          }}
          onSkip={() => {
            void updateSettings({ hasCompletedOnboarding: true });
          }}
        />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function OnboardingDialog({
  onEnableNotch,
  onAddDemo,
  onSkip,
}: {
  onEnableNotch: () => Promise<void>;
  onAddDemo: () => Promise<void>;
  onSkip: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={t("welcomeAria")}
        className="glass-shell w-full max-w-[520px] rounded-[18px] p-5"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-accent)] text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {t("welcomeTitle")}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {t("welcomeBody")}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <OnboardingPoint
            icon={<MousePointer2 size={16} />}
            title={t("notchPointTitle")}
            description={t("notchPointBody")}
          />
          <OnboardingPoint
            icon={<Search size={16} />}
            title={t("searchScreenshotsTitle")}
            description={t("searchScreenshotsBody")}
          />
          <OnboardingPoint
            icon={<ShieldCheck size={16} />}
            title={t("localPointTitle")}
            description={t("localPointBody")}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onEnableNotch} className="btn-primary">
            {t("enableNotchHover")}
          </button>
          <button type="button" onClick={onAddDemo} className="btn-ghost border border-[var(--color-border-subtle)]">
            {t("addDemoClips")}
          </button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="btn-ghost mt-2 w-full text-[var(--color-text-muted)]"
        >
          {t("skipForNow")}
        </button>
      </div>
    </div>
  );
}

function LanguageDialog({ onSelect }: { onSelect: (language: Language) => void }) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    settings.language ?? "en",
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={t("chooseLanguageTitle")}
        className="glass-shell w-full max-w-[460px] rounded-[18px] p-5"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-accent)] text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {t("chooseLanguageTitle")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
              {t("chooseLanguageBody")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {LANGUAGE_OPTIONS.map((language) => (
            <button
              key={language.value}
              type="button"
              onClick={() => {
                setSelectedLanguage(language.value);
                void updateSettings({ language: language.value });
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-[var(--radius-lg)] border px-3 py-3 text-left transition-colors",
                selectedLanguage === language.value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-text)]"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
              )}
            >
              <span className="text-sm font-medium">{language.nativeName}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {language.label}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onSelect(selectedLanguage)}
          className="btn-primary mt-4 w-full"
        >
          {t("continue")}
        </button>
      </div>
    </div>
  );
}

function OnboardingPoint({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="panel flex gap-3 p-3">
      <div className="mt-0.5 text-[var(--color-accent)]">{icon}</div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function LoadingGrid({ compact }: { compact: boolean }) {
  const { t } = useI18n();
  const gridClass = compact
    ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className={cn("grid gap-3", gridClass)} aria-label={t("loadingMore")}>
      {Array.from({ length: compact ? 10 : 8 }).map((_, index) => (
        <div key={index} className="panel p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-border-subtle)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--color-border-subtle)]" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-[var(--color-border-subtle)]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-[var(--color-border-subtle)]" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--color-border-subtle)]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-border-subtle)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active?: boolean;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-[13px] transition-colors",
        active
          ? "bg-[var(--color-accent-subtle)] font-medium text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
          {count}
        </span>
      )}
    </button>
  );
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="text-section mb-1.5 px-2.5">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function EmptyState({ capturePaused }: { capturePaused: boolean }) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col items-center justify-center py-20 text-center">
      <div className="panel mb-4 flex h-14 w-14 items-center justify-center">
        <FolderOpen size={24} className="text-[var(--color-accent)]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--color-text)]">
        {capturePaused ? t("emptyPausedTitle") : t("emptyTitle")}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-text-muted)]">
        {capturePaused ? t("emptyPausedBody") : t("emptyBody")}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-[12px] text-[var(--color-text-muted)]">
        <span className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1">
          {t("searchHint")}
        </span>
        <span className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-1">
          {t("actionsHint")}
        </span>
      </div>
    </div>
  );
}
