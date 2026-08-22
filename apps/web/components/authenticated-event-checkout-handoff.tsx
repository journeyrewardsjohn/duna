"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthenticatedEventCheckoutHandoff({
  checkoutHref,
}: {
  readonly checkoutHref: string;
}) {
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(checkoutHref);
  }, [checkoutHref, loading, router, user]);

  return null;
}
