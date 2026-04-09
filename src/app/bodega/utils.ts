/* ── Utils ──────────────────────────────────────────────────── */
export function toRoman(n: number): string {
  return ['I','II','III','IV','V'][n - 1] ?? String(n)
}