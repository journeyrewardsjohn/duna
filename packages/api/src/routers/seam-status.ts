import { z } from "zod";

/**
 * Output of the placeholder `status` query every R3 seam router mounts. It
 * proves the mount is type-checked and reachable in demo mode. A domain agent
 * deletes its placeholder once real procedures exist; the knowledge generator
 * deliberately ignores procedures named `status` in routers/**.
 */
export const domainSeamStatusSchema = z.object({
  domain: z.string().min(1),
  ready: z.boolean(),
});

export type DomainSeamStatus = z.infer<typeof domainSeamStatusSchema>;

export function domainSeamStatus(domain: string): DomainSeamStatus {
  return { domain, ready: false };
}
