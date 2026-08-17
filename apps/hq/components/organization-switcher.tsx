"use client";

import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { switchWorkspaceAction } from "@/app/workspace-actions";
import type { WorkspaceOption } from "@/lib/workspace-options";

export function OrganizationSwitcher({
  currentOrganizationId,
  name,
  plan,
  workspaces,
}: {
  readonly currentOrganizationId?: string;
  readonly name: string;
  readonly plan: string;
  readonly workspaces: readonly WorkspaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;

    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="organization-switcher-menu" ref={menuRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${open ? "Close" : "Open"} organization switcher. Current organization: ${name}`}
        className="organization-switcher"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <span>{initials}</span>
        <span>
          <strong>{name}</strong>
          <small>{plan.replaceAll("-", " ")} plan</small>
        </span>
        <ChevronDown aria-hidden size={15} />
      </button>
      {open && (
        <section
          aria-label="Switch organization"
          className="organization-switcher-menu__panel"
          id={menuId}
          role="dialog"
        >
          <header>
            <span>
              <Building2 aria-hidden size={16} /> Organizations
            </span>
            <small>Switch your operating context</small>
          </header>
          <div className="organization-switcher-menu__list">
            {workspaces.map((workspace) => {
              const active = workspace.id === currentOrganizationId;
              return (
                <form action={switchWorkspaceAction} key={workspace.id}>
                  <input
                    name="organizationId"
                    type="hidden"
                    value={workspace.id}
                  />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <button
                    aria-current={active ? "true" : undefined}
                    className={active ? "active" : undefined}
                    disabled={active}
                    type="submit"
                  >
                    <span className="organization-switcher-menu__avatar">
                      {workspace.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>
                        {active
                          ? "Current organization"
                          : "Switch to this organization"}
                      </small>
                    </span>
                    {active && <Check aria-hidden size={16} />}
                  </button>
                </form>
              );
            })}
          </div>
          <footer>
            <Link href="/onboarding?mode=create" onClick={() => setOpen(false)}>
              <Plus aria-hidden size={16} /> Create new organization
            </Link>
          </footer>
        </section>
      )}
    </div>
  );
}
