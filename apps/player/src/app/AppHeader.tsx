/**
 * The old in-screen header (wordmark, bell, avatar) that legacy screens
 * still render at their top. Inside the new shell the route header carries
 * the title, the back control, Messages and the account, so this renders
 * nothing; it is deleted with the last legacy screen that imports it
 * (PlansScreen, PerformanceScreen,
 * PredictionPortfolioScreen).
 */
export function AppHeader(props: { readonly eyebrow?: string }) {
  void props;
  return null;
}
