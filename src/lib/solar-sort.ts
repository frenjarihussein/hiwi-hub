export function sortSolarRows<T>(rows: T[], value: (row: T) => string | number | null | undefined, descending = false): T[] {
  return [...rows].sort((a,b) => {
    const x = value(a), y = value(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y),'ar',{ numeric:true });
    return descending ? -result : result;
  });
}