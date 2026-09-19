import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared multi-line text field.
 *
 * Two things the hand-rolled messaging textareas were missing:
 *  1. a 16px font-size on touch — below 16px, iOS WebKit auto-zooms the viewport on
 *     focus and (because we correctly leave pinch-zoom enabled) never restores it.
 *     Same `text-base md:text-sm` pattern as ui/input.tsx.
 *  2. auto-grow — `rows={1}` with a max-height but no resize handler means a long
 *     message scrolls inside a 40px slot and you can't re-read what you typed.
 *
 * Base UI ships no textarea primitive and the auto-grow needs a real element ref, so
 * this wraps a raw <textarea> (unlike ui/input.tsx's InputPrimitive) while mirroring
 * that component's data-slot, focus-ring and disabled conventions.
 */
function Textarea({
  className,
  maxRows = 5,
  onChange,
  ...props
}: React.ComponentProps<"textarea"> & { maxRows?: number }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const grow = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows)}px`
  }, [maxRows])

  // Layout effect so a restored draft is the right height before first paint.
  React.useLayoutEffect(grow, [grow, props.value])

  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      rows={1}
      onChange={(e) => {
        grow()
        onChange?.(e)
      }}
      className={cn(
        "min-h-11 w-full min-w-0 resize-none overflow-y-auto rounded-xl border border-input",
        "bg-background px-3.5 py-2.5 leading-snug transition-colors outline-none",
        "placeholder:text-muted-foreground",
        // 16px on touch (no iOS auto-zoom), 14px density from md up.
        "text-base md:text-sm",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "dark:bg-input/30 dark:disabled:bg-input/80",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
