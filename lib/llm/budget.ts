const DAILY_CAP_TOKENS = 2_000_000;
export function chargeTokens(n: number): boolean {
  const spent = ((globalThis as any).__llmSpent as number | undefined) ?? 0;
  if (spent + n > DAILY_CAP_TOKENS) return false;
  (globalThis as any).__llmSpent = spent + n;
  return true;
}
export function budgetRemaining(): number {
  const spent = ((globalThis as any).__llmSpent as number | undefined) ?? 0;
  return Math.max(0, DAILY_CAP_TOKENS - spent);
}
