import { useEffect, useState } from "react";
import { appBadge } from "../lib/app-icons";
import { getAppIcon } from "../lib/api";
import { cn } from "../lib/utils";

const iconCache = new Map<string, string | null>();

interface AppIconProps {
  appName?: string;
  className?: string;
  size?: "xs" | "sm" | "md";
  title?: string;
}

const sizeClasses = {
  xs: "h-4 w-4 rounded-[4px]",
  sm: "h-[18px] w-[18px] rounded-[5px]",
  md: "h-6 w-6 rounded-[6px]",
};

const labelSizes = {
  xs: "text-[8px]",
  sm: "text-[9px]",
  md: "text-[10px]",
};

export function AppIcon({ appName, className, size = "sm", title }: AppIconProps) {
  const [src, setSrc] = useState<string | null>(() =>
    appName ? iconCache.get(appName) ?? null : null,
  );

  useEffect(() => {
    if (!appName?.trim()) {
      setSrc(null);
      return;
    }

    if (iconCache.has(appName)) {
      setSrc(iconCache.get(appName) ?? null);
      return;
    }

    let cancelled = false;
    getAppIcon(appName)
      .then((icon) => {
        iconCache.set(appName, icon);
        if (!cancelled) setSrc(icon);
      })
      .catch(() => {
        iconCache.set(appName, null);
      });

    return () => {
      cancelled = true;
    };
  }, [appName]);

  const badge = appBadge(appName);
  const label = title ?? appName ?? "Unknown";

  if (src) {
    return (
      <img
        src={src}
        alt=""
        title={label}
        draggable={false}
        className={cn("shrink-0 object-cover", sizeClasses[size], className)}
      />
    );
  }

  return (
    <span
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center font-bold text-white",
        sizeClasses[size],
        labelSizes[size],
        badge.bg,
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
