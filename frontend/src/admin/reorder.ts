/** Pure helpers behind drag-to-reorder (useDragReorder), kept apart so they can be tested without a DOM. */

/** Where a row sits on the page when the drag starts (page coordinates, so scrolling does not move it) */
export interface Slot {
  top: number
  height: number
}

/** A copy of `list` with the item at `from` moved to `to` */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Index the dragged row (at `from`, moved by `dy` pixels) would be dropped at: the number of other rows whose middle
 * is above its own middle.
 */
export function dropIndex(slots: readonly Slot[], from: number, dy: number): number {
  const dragged = slots[from]
  const middle = dragged.top + dy + dragged.height / 2
  let index = 0
  slots.forEach((s, i) => {
    if (i !== from && s.top + s.height / 2 < middle) index++
  })
  return index
}

/**
 * How far row `i` slides while the row at `from` is dragged towards `to` (rows evenly spaced, as in a table or a
 * list with a fixed gap): the rows it passes make room by its height plus the gap. The DOM order stays as it is
 * during the drag: moving the dragged node would make the browser drop its pointer capture.
 */
export function shiftOf(slots: readonly Slot[], from: number, to: number, i: number): number {
  if (i === from || slots.length < 2) return 0
  const gap = slots[1].top - slots[0].top - slots[0].height
  const step = slots[from].height + gap
  if (from < i && i <= to) return -step
  if (to <= i && i < from) return step
  return 0
}

/**
 * What the server needs to put `id` where it now is in `ids` (the order after the move): just before the next row,
 * or, when it became the last one, just after the row before it. null when it is alone (nothing to move).
 */
export function dropAnchor(ids: readonly number[], id: number): { beforeId: number } | { afterId: number } | null {
  const index = ids.indexOf(id)
  if (index < ids.length - 1) return { beforeId: ids[index + 1] }
  if (index > 0) return { afterId: ids[index - 1] }
  return null
}
