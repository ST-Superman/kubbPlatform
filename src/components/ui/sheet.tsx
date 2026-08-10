"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight overlay panel: a backdrop + a panel that slides in from the bottom
 * (mobile action sheets) or the right (nav drawer). Closes on backdrop tap / Escape.
 * Locks body scroll while open and respects the bottom safe-area inset.
 */
export function Sheet({
  open,
  onClose,
  side = "bottom",
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "bottom" | "right";
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute bg-card shadow-2xl ring-1 ring-foreground/10 transition-transform duration-300 ease-out",
          side === "bottom"
            ? cn(
                "inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[22px] pb-[max(1rem,env(safe-area-inset-bottom))]",
                open ? "translate-y-0" : "translate-y-full",
              )
            : cn(
                "inset-y-0 right-0 w-[82%] max-w-xs overflow-y-auto",
                open ? "translate-x-0" : "translate-x-full",
              ),
        )}
      >
        {side === "bottom" ? (
          <div className="sticky top-0 flex justify-center bg-card pt-3 pb-1">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
