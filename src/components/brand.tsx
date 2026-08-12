import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Brand king-kubb mark on its gold disc — the header/auth lockup.
 * `size` is the disc diameter; the mark sits at ~63% inside (per design: 19px in a 30px disc).
 */
export function LogoMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const inner = Math.round(size * 0.63);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[var(--swedish-gold)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-transparent.png"
        alt=""
        width={inner}
        height={inner}
        className="object-contain"
        style={{ width: inner, height: inner }}
      />
    </span>
  );
}

/** Standalone mark on paper (hero/auth light) — no disc. */
export function LogoImage({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo-transparent.png"
      alt="Kubb Portal"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Design-system CTA: full-width, mono ALL-CAPS, spring press.
 * Primary = brand blue; secondary = paper-2 fill; outline = bordered card.
 * Pass `size` to switch the 48px default to the 44px secondary height.
 */
export function ctaClass(
  variant: "primary" | "secondary" | "outline" = "primary",
  size: "md" | "sm" = "md",
) {
  return cn(
    "inline-flex w-full items-center justify-center rounded-[14px] font-mono font-bold uppercase tracking-[1.4px] transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "h-12 text-[12px]" : "h-11 text-[11.5px]",
    variant === "primary" && "bg-primary text-primary-foreground",
    variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    variant === "outline" && "border border-border bg-card text-foreground hover:bg-muted",
  );
}
