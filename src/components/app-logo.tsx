import { cn } from "../lib/utils";

export function AppLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const radius =
    size === "sm"
      ? "rounded-[9px]"
      : size === "lg"
        ? "rounded-[14px]"
        : "rounded-[var(--radius-md)]";

  return (
    <div
      className={cn(
        "flex shrink-0 overflow-hidden bg-black",
        dim,
        radius,
      )}
    >
      <img
        src="/assets/clipflow-icon.png"
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
