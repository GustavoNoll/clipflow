import { listen } from "@tauri-apps/api/event";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";

type ClipboardFeedbackVariant = "dark" | "light";
type ClipboardFeedbackPosition = "top" | "bottom";

interface ClipboardFeedbackProps {
  variant?: ClipboardFeedbackVariant;
  position?: ClipboardFeedbackPosition;
  compact?: boolean;
}

export function ClipboardFeedback({
  variant = "dark",
  position = "bottom",
  compact = false,
}: ClipboardFeedbackProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function show(nextMessage: string) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(nextMessage);
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), 1500);
    }

    const unlistenNewItem = listen("clipboard:new-item", () => {
      show(t("copiedToClipFlow"));
    });
    const unlistenCopied = listen("clipboard:item-copied", () => {
      show(t("copiedToClipboard"));
    });
    const unlistenCleared = listen<number>("clipboard:history-cleared", (event) => {
      show(event.payload > 0 ? t("historyCleared") : t("nothingToClear"));
    });
    function onLocalFeedback(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      show(detail || t("copiedToClipboard"));
    }
    window.addEventListener("clipflow:clipboard-feedback", onLocalFeedback);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("clipflow:clipboard-feedback", onLocalFeedback);
      unlistenNewItem.then((fn) => fn());
      unlistenCopied.then((fn) => fn());
      unlistenCleared.then((fn) => fn());
    };
  }, [t]);

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ease-out",
        position === "top" ? "top-3" : "bottom-4",
        visible
          ? "translate-y-0 opacity-100"
          : position === "top"
            ? "-translate-y-1.5 opacity-0"
            : "translate-y-1.5 opacity-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 backdrop-blur-md",
          compact && "px-2.5 py-1.5 text-[11px]",
          variant === "dark"
            ? "bg-white/[0.12] text-white ring-white/[0.14]"
            : "bg-black/[0.78] text-white ring-black/[0.08]",
        )}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#30b05a] text-white">
          <Check size={11} strokeWidth={2.5} />
        </span>
        {message}
      </div>
    </div>
  );
}
