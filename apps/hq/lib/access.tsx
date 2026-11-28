import { buttonClassName } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemedTideline } from "@/components/themed-tideline";
import { AccessDeniedState } from "@/lib/access-state";
import { isPermissionDenied } from "@/lib/permission-denied";

export interface AccessDeniedProps {
  /** What they tried to open: "Money". */
  readonly area: string;
  /** Where "back" goes. */
  readonly backHref?: string;
  readonly backLabel?: string;
}

/**
 * The page a person sees when the server refused them an HQ area: the kit's
 * PermissionDenied (what, who can grant it, a way back). Logged at info: a
 * refusal is a normal outcome, not an error.
 */
export function AccessDenied({
  area,
  backHref = "/",
  backLabel = "Back to HQ",
}: AccessDeniedProps) {
  return (
    <main
      className="hq-page module-page"
      style={{ margin: "0 auto", maxWidth: 720, padding: "32px 16px" }}
    >
      <header className="hq-page-heading">
        <div>
          <h1>{area}</h1>
        </div>
      </header>
      <ThemedTideline>
        <AccessDeniedState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={backHref}
            >
              {backLabel}
            </Link>
          }
          area={area}
          grantedBy="an owner of your club"
        />
      </ThemedTideline>
    </main>
  );
}

/**
 * Run a page's data loading; when the server refuses the person, return the
 * AccessDenied page instead of letting the route crash. Any other failure is
 * rethrown for the route's error boundary.
 */
export async function orAccessDenied<T>(
  area: string,
  load: () => Promise<T>,
  options?: Pick<AccessDeniedProps, "backHref" | "backLabel">,
): Promise<{ readonly value: T } | { readonly denied: ReactNode }> {
  try {
    return { value: await load() };
  } catch (error) {
    if (isPermissionDenied(error)) {
      return { denied: <AccessDenied area={area} {...options} /> };
    }
    throw error;
  }
}
