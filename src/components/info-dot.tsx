"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { GLOSSARY } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * A small ⓘ button that opens a short explanation on click (mobile-friendly —
 * no hover dependency). Pass a glossary `term`, or a custom `title` + `children`.
 */
export function InfoDot({
  term,
  title,
  children,
  className,
}: {
  term?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const entry = term ? GLOSSARY[term] : undefined;
  const heading = title ?? entry?.label ?? "";
  const body: ReactNode = children ?? entry?.body ?? "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!heading && !body) return null;

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={heading ? `What is ${heading}?` : "More info"}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-grid size-[15px] cursor-help place-items-center rounded-full border border-muted-foreground/40 font-serif text-[10px] font-semibold italic leading-none text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+6px)] z-50 w-56 -translate-x-1/2 rounded-xl border border-border bg-card p-3 text-left normal-case shadow-lg ring-1 ring-foreground/10"
        >
          {heading ? (
            <span className="block text-[11px] font-semibold tracking-normal text-foreground">
              {heading}
            </span>
          ) : null}
          <span className="mt-0.5 block text-[11px] font-normal leading-snug tracking-normal text-muted-foreground">
            {body}
          </span>
        </span>
      ) : null}
    </span>
  );
}
