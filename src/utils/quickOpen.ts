export function clampQuickOpenIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export function moveQuickOpenIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  const clamped = clampQuickOpenIndex(index, count);
  return (clamped + delta + count) % count;
}
