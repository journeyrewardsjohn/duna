import { DunaMark } from "@duna/ui";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";

export function AdminAccessDenied() {
  return (
    <main className="admin-access-denied">
      <div>
        <DunaMark />
        <span className="admin-access-denied__icon">
          <ShieldAlert aria-hidden size={24} />
        </span>
        <p className="page-eyebrow">Protected control plane</p>
        <h1>Platform administration access required.</h1>
        <p>
          This workspace is limited to verified Duna administrators. Club owners
          and staff can continue operating their organization in Duna HQ.
        </p>
        <Link href="/">
          <ArrowLeft aria-hidden size={17} />
          Return to club HQ
        </Link>
      </div>
    </main>
  );
}
