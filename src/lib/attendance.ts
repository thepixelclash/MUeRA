/** Attendance % = attended / conducted × 100. Returns null when nothing conducted yet. */
export function attendancePct(attended: number, conducted: number): number | null {
  if (conducted <= 0) return null;
  return (attended / conducted) * 100;
}

/** Minimum consecutive classes to attend to reach target p (0-1): max(0, ceil((pT − A)/(1 − p))). null = impossible. */
export function classesNeeded(attended: number, conducted: number, p: number): number | null {
  if (attended >= p * conducted) return 0;
  if (p >= 1) return null;
  return Math.max(0, Math.ceil((p * conducted - attended) / (1 - p) - 1e-9));
}

/** Future classes that can be missed while staying ≥ target: floor(A/p − T). */
export function classesCanMiss(attended: number, conducted: number, p: number): number {
  if (p <= 0) return Infinity;
  if (attended < p * conducted) return 0;
  return Math.max(0, Math.floor(attended / p - conducted + 1e-9));
}

export function simulate(
  attended: number,
  conducted: number,
  attendNext: number,
  missNext: number,
) {
  const A = attended + attendNext;
  const T = conducted + attendNext + missNext;
  return { attended: A, conducted: T, pct: attendancePct(A, T) };
}
