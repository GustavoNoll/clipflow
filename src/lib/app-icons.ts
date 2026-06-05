const APP_STYLES: Record<string, { bg: string; label: string }> = {
  "Google Chrome": { bg: "bg-red-500", label: "C" },
  Chrome: { bg: "bg-red-500", label: "C" },
  Safari: { bg: "bg-sky-500", label: "S" },
  Finder: { bg: "bg-blue-400", label: "F" },
  Cursor: { bg: "bg-zinc-100 text-zinc-900", label: "Cu" },
  "Visual Studio Code": { bg: "bg-blue-600", label: "VS" },
  Code: { bg: "bg-blue-600", label: "VS" },
  Slack: { bg: "bg-purple-600", label: "Sl" },
  Figma: { bg: "bg-orange-500", label: "Fi" },
  Mail: { bg: "bg-sky-400", label: "M" },
  Terminal: { bg: "bg-zinc-700", label: "T" },
  Notes: { bg: "bg-yellow-400 text-zinc-900", label: "N" },
};

export function appBadge(sourceApp?: string): { bg: string; label: string } {
  if (!sourceApp) {
    return { bg: "bg-zinc-600", label: "?" };
  }
  if (APP_STYLES[sourceApp]) {
    return APP_STYLES[sourceApp];
  }
  const words = sourceApp.split(/\s+/);
  const label =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
      : sourceApp.slice(0, 2);
  return { bg: "bg-zinc-600", label };
}
