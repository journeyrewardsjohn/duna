export function tradablePredictionPriceBps(priceBps: number): number {
  return Math.min(9_900, Math.max(100, priceBps));
}
