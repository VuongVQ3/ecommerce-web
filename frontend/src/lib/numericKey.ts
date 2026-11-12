/**
 * A stable number for a string id (useDragReorder wants numeric ids): 32-bit FNV-1a. Same id, same number; two
 * different ids in one list colliding is practically impossible for the few dozen items a list holds.
 */
export function numericKey(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
