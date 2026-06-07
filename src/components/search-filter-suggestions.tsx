import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { SourceApp } from "../lib/types";
import { cn } from "../lib/utils";

interface SearchFilterSuggestionsProps {
  query: string;
  sourceApps?: SourceApp[];
  dark?: boolean;
  onApply: (query: string) => void;
}

export interface SearchFilterSuggestion {
  token: string;
  label: string;
  descriptionKey?: "filterByApp" | "filterImages" | "filterCode" | "filterLinks" | "filterFavorites" | "filterPinned";
  description?: string;
}

const BASE_SUGGESTIONS: SearchFilterSuggestion[] = [
  { token: "@app:", label: "@app:", descriptionKey: "filterByApp" },
  { token: "@type:image", label: "@type:image", descriptionKey: "filterImages" },
  { token: "@type:code", label: "@type:code", descriptionKey: "filterCode" },
  { token: "@type:url", label: "@type:url", descriptionKey: "filterLinks" },
  { token: "@fav", label: "@fav", descriptionKey: "filterFavorites" },
  { token: "@pin", label: "@pin", descriptionKey: "filterPinned" },
];

export function SearchFilterSuggestions({
  query,
  sourceApps = [],
  dark = false,
  onApply,
}: SearchFilterSuggestionsProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeToken = useMemo(() => currentAtToken(query), [query]);
  const suggestions = useMemo(
    () => getSearchFilterSuggestions(query, sourceApps),
    [query, sourceApps],
  );

  if (!activeToken || suggestions.length === 0) return null;

  function applySuggestion(suggestion: SearchFilterSuggestion) {
    onApply(applySearchFilterSuggestion(query, suggestion));
  }

  return (
    <div
      role="listbox"
      className={cn(
        "absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[12px] border py-1 shadow-[var(--shadow-popover)] backdrop-blur-2xl",
        dark
          ? "border-white/[0.10] bg-black/78 text-white"
          : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)]",
      )}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          applySuggestion(suggestions[activeIndex] ?? suggestions[0]);
        }
      }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.token}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => applySuggestion(suggestion)}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors",
            dark
              ? index === activeIndex
                ? "bg-white/[0.12]"
                : "hover:bg-white/[0.08]"
              : index === activeIndex
                ? "bg-[var(--color-surface-hover)]"
                : "hover:bg-[var(--color-surface-hover)]",
          )}
        >
          <span className="font-mono font-semibold">{suggestion.label}</span>
          <span className={dark ? "text-white/42" : "text-[var(--color-text-muted)]"}>
            {suggestion.descriptionKey
              ? t(suggestion.descriptionKey)
              : suggestion.description}
          </span>
        </button>
      ))}
    </div>
  );
}

export function applyFirstSearchFilterSuggestion(query: string, sourceApps: SourceApp[]) {
  const suggestion = getSearchFilterSuggestions(query, sourceApps)[0];
  if (!suggestion) return query;
  return applySearchFilterSuggestion(query, suggestion);
}

export function hasSearchFilterSuggestion(query: string, sourceApps: SourceApp[]) {
  return getSearchFilterSuggestions(query, sourceApps).length > 0;
}

export function getSearchFilterSuggestions(query: string, sourceApps: SourceApp[]) {
  const activeToken = currentAtToken(query);
  if (!activeToken) return [];
  const normalized = activeToken.toLowerCase();
  const appSuggestions: SearchFilterSuggestion[] = sourceApps.slice(0, 8).map((app) => ({
    token: `@app:${app.name}`,
    label: `@app:${app.name}`,
    description: `${app.count} ${app.count === 1 ? "clip" : "clips"}`,
  }));
  return [...BASE_SUGGESTIONS, ...appSuggestions]
    .filter((suggestion) => suggestion.token.toLowerCase().startsWith(normalized))
    .slice(0, 7);
}

export function applySearchFilterSuggestion(query: string, suggestion: SearchFilterSuggestion) {
  return replaceCurrentAtToken(query, suggestion.token);
}

function currentAtToken(query: string) {
  const match = query.match(/(?:^|\s)(@[^\s]*)$/);
  return match?.[1] ?? null;
}

function replaceCurrentAtToken(query: string, replacement: string) {
  return query.replace(/(?:^|\s)(@[^\s]*)$/, (match) => {
    const prefix = match.startsWith(" ") ? " " : "";
    return `${prefix}${replacement} `;
  });
}
