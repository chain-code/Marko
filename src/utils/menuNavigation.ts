export interface MenuNavigationItem {
  type?: string;
  disabled?: boolean;
}

export type MenuNavigationDirection = -1 | 1;

export function getNavigableMenuIndexes(items: readonly MenuNavigationItem[]): number[] {
  return items.flatMap((item, index) => (
    item.type === "separator" || item.disabled ? [] : [index]
  ));
}

export function findAdjacentMenuItemIndex(
  items: readonly MenuNavigationItem[],
  currentIndex: number,
  direction: MenuNavigationDirection,
): number {
  const indexes = getNavigableMenuIndexes(items);
  if (indexes.length === 0) return -1;

  if (direction === 1) {
    return indexes.find((index) => index > currentIndex) ?? indexes[0];
  }

  return [...indexes].reverse().find((index) => index < currentIndex) ?? indexes[indexes.length - 1];
}

export function findBoundaryMenuItemIndex(
  items: readonly MenuNavigationItem[],
  boundary: "first" | "last",
): number {
  const indexes = getNavigableMenuIndexes(items);
  if (indexes.length === 0) return -1;
  return boundary === "first" ? indexes[0] : indexes[indexes.length - 1];
}

export function wrapMenuIndex(
  currentIndex: number,
  itemCount: number,
  direction: MenuNavigationDirection,
): number {
  if (itemCount <= 0) return -1;
  const normalized = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0;
  return (normalized + direction + itemCount) % itemCount;
}

export function isMenuActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}
