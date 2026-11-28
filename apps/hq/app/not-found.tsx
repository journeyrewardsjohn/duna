import Link from "next/link";
import {
  ErrorState,
  errorStateActionClass,
} from "@/components/observability/error-state";

export default function NotFound() {
  return (
    <ErrorState
      actions={
        <Link className={errorStateActionClass.primary} href="/">
          Back to HQ
        </Link>
      }
      alert={false}
      description="The link may be old, the page may have moved, or it may belong to an organisation you are not signed in to."
      eyebrow="Page not found"
      title="We can’t find that page"
      zone="hq"
    />
  );
}
