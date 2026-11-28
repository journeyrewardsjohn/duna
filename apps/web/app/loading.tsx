import { DunaMark } from "@duna/ui";

export default function Loading() {
  return (
    <div aria-live="polite" className="site-loading" role="status">
      <DunaMark decorative size={32} />
      <span className="site-loading__label">Loading Duna</span>
    </div>
  );
}
