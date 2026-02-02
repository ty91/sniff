export function selectTopN<T>(items: T[], n: number): T[] {
  return items.slice(0, Math.max(0, n));
}
