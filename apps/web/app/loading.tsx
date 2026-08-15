export default function Loading() {
  return (
    <div aria-live="polite" className="site-loading" role="status">
      <img alt="" aria-hidden src="/brand/duna-icon.png" />
      <span className="site-loading__label">Loading Duna</span>
    </div>
  );
}
