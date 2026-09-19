import { useRef } from "react"

/**
 * Press-and-hold, for touch-reachable message actions.
 *
 * The existing message menu is a 24px trigger that is `opacity-0` until
 * `group-hover` — on a phone there is no hover, so block/report effectively does
 * not exist on the surface where it matters most. This hook gives the bubble
 * itself a 450ms long-press, plus right-click on desktop.
 *
 * Pointer events cover mouse, touch and pen with one code path. The 10px slop
 * cancels the press when the gesture turns out to be a scroll.
 *
 *   const press = useLongPress(() => setMenuFor(m.id))
 *   <div {...press} className="… select-none [-webkit-touch-callout:none]">
 */
export function useLongPress(fire: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const from = useRef({ x: 0, y: 0 })

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      from.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = setTimeout(fire, ms)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y)
      if (d > 10) clear() // it's a scroll, not a press
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      fire()
    },
  }
}
