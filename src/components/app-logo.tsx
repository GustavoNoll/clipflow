import { ClipboardCopy } from "lucide-react";
import { cn } from "../lib/utils";

export function AppLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const icon = size === "sm" ? 14 : size === "lg" ? 20 : 16;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white",
        dim,
      )}
    >
      <ClipboardCopy size={icon} strokeWidth={2.25} />
    </div>
  );
}
