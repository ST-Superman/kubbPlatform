"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Lightweight overlay panel: a backdrop + a panel that slides in from the bottom
 * (mobile action sheets) or the right (nav drawer). While open it:
 *  - closes on Escape / backdrop tap and locks body scroll,
 *  - moves focus into the panel on open — DESKTOP ONLY (autofocus on touch throws the
 *    software keyboard up before the user has read the sheet),
 *  - traps Tab / Shift+Tab so focus can't reach the controls behind it,
 *  - returns focus to whatever opened it on close,
 *  - respects prefers-reduced-motion (fades instead of sliding),
 *  - respects the bottom safe-area inset (viewportFit: cover).
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Hold onClose in a ref so the focus effect can depend on [open] alone — otherwise a
  // new inline onClose each parent render would re-run it and re-steal focus mid-use.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;

    // Capture the opener first, then move focus in — desktop only.
    const toRestore = document.activeElement as HTMLElement | null;
    const fine =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
    if (fine && panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at the edges; the panel container (tabIndex -1) counts as "before first".
      if (e.shiftKey && (active === firstEl || active === panel || !panel.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !panel.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      toRestore?.focus?.(); // return focus to the opener
    };
  }, [open]);

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute bg-card shadow-2xl ring-1 ring-foreground/10 outline-none transition-transform duration-300 ease-out",
          // prefers-reduced-motion: drop the slide; the wrapper's opacity fade carries it.
          "motion-reduce:transition-none",
          side === "bottom"
            ? cn(
                "inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[22px] pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:translate-y-0",
                open ? "translate-y-0" : "translate-y-full",
              )
            : cn(
                "inset-y-0 right-0 w-[82%] max-w-xs overflow-y-auto motion-reduce:translate-x-0",
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
