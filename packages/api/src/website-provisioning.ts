import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  getDatabase,
  getTransactionalDatabase,
  websiteSites,
  websiteRevisions,
} from "@duna/db";
import { and, eq } from "drizzle-orm";
import type { ApiActor } from "./context";
import { assertWebsiteActor, getWebsiteBilling } from "./website-billing";

export type WebsitePublishPage = { path: string; html: string };
type Site = typeof websiteSites.$inferSelect;
type Deployment = {
  id?: string;
  uid?: string;
  url: string;
  readyState?: string;
  state?: string;
  projectId?: string;
  meta?: Record<string, string>;
};
const providerKeys = [
  "DUNA_SITES_VERCEL_TOKEN",
  "DUNA_SITES_VERCEL_TEAM_ID",
  "DUNA_SITES_NEON_API_KEY",
  "DUNA_SITES_NEON_ORG_ID",
] as const;
export function websiteHostingReadiness() {
  const missing = providerKeys.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}
function configuration() {
  const ready = websiteHostingReadiness();
  if (!ready.configured)
    throw new Error(
      "Website hosting is not connected yet. Contact Duna to finish hosting setup.",
    );
  return {
    vercelToken: process.env.DUNA_SITES_VERCEL_TOKEN!,
    teamId: process.env.DUNA_SITES_VERCEL_TEAM_ID!,
    neonKey: process.env.DUNA_SITES_NEON_API_KEY!,
    neonOrg: process.env.DUNA_SITES_NEON_ORG_ID!,
  };
}
class ProviderError extends Error {
  constructor(
    readonly status: number,
    provider: string,
  ) {
    super(
      `${provider} request failed (${status}). Retry after checking the hosting connection.`,
    );
  }
}
async function request<T>(
  provider: "Vercel" | "Neon",
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const config = configuration();
  const url = new URL(
    path,
    provider === "Vercel"
      ? "https://api.vercel.com"
      : "https://console.neon.tech/api/v2/",
  );
  if (provider === "Vercel") url.searchParams.set("teamId", config.teamId);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${provider === "Vercel" ? config.vercelToken : config.neonKey}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new ProviderError(response.status, provider);
  return (await response.json()) as T;
}
async function ownedSite(
  actor: ApiActor,
  siteId: string,
  owner = false,
): Promise<Site> {
  const organizationId = assertWebsiteActor(actor, owner);
  const site = await getDatabase().query.websiteSites.findFirst({
    where: and(
      eq(websiteSites.id, siteId),
      eq(websiteSites.organizationId, organizationId),
    ),
  });
  if (!site) throw new Error("Website was not found in this club.");
  return site;
}
export function normalizeWebsiteDomain(input: string): string {
  const value = input.trim().toLowerCase().replace(/\.$/, "");
  if (
    value.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) ||
    value.endsWith(".vercel.app") ||
    value.endsWith(".neon.tech") ||
    value === "duna.coach" ||
    value.endsWith(".duna.coach")
  )
    throw new Error(
      "Enter a domain you own, such as club.example.com, without a URL or path.",
    );
  return value;
}
export function validatePublishPages(pages: readonly WebsitePublishPage[]) {
  if (!pages.length || pages.length > 30 || !pages.some((p) => p.path === "/"))
    throw new Error("The website needs a homepage and at most 30 pages.");
  const paths = new Set<string>();
  let bytes = 0;
  for (const page of pages) {
    if (
      !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page.path) ||
      paths.has(page.path)
    )
      throw new Error("Website page paths must be unique and valid.");
    paths.add(page.path);
    bytes += Buffer.byteLength(page.html);
    if (
      !page.html.includes("<html") ||
      /<script\b(?![^>]*type=["']application\/ld\+json["'])/i.test(page.html) ||
      /\bon\w+\s*=/i.test(page.html) ||
      /<(?:iframe|object|embed)\b/i.test(page.html)
    )
      throw new Error("Published pages must use Duna's safe website renderer.");
  }
  if (bytes > 5_000_000)
    throw new Error("The website is too large to publish.");
}
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; script-src 'none'; connect-src 'none'; form-action https://duna.coach https://hq.duna.coach; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
/** Only maintained runtime code is deployed; generated content is data in isolated Postgres. */
export function websiteRuntimeFiles(revisionId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(revisionId))
    throw new Error("Invalid revision ID.");
  const handler = `import { neon } from '@neondatabase/serverless';
const revision = ${JSON.stringify(revisionId)};
const headers = ${JSON.stringify(securityHeaders)};
export default async function handler(req,res) {
 for (const [name,value] of Object.entries(headers)) res.setHeader(name,value);
 if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return res.status(405).end('Method not allowed'); }
 try {
 const url = new URL(req.url,'https://website.invalid');
 const path = '/' + (url.searchParams.get('path') || '').replace(/^\\/+|\\/+$/g,'');
 if (path.length > 500) return res.status(404).end('Page not found');
 const sql = neon(process.env.DATABASE_URL);
 const pages = await sql.query('SELECT html FROM duna_site_pages WHERE revision_id = $1 AND path = $2',[revision,path]);
 if (!pages[0]) return res.status(404).end('Page not found');
 res.setHeader('Content-Type','text/html; charset=utf-8'); res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Duna-Revision',revision); return res.status(200).end(req.method==='HEAD'?'':pages[0].html);
 } catch { res.setHeader('Cache-Control','no-store'); return res.status(503).end('This website is temporarily unavailable. Please try again.'); }
}`;
  return [
    { file: "api/site.js", data: handler, encoding: "utf-8" },
    {
      file: "package.json",
      data: JSON.stringify({
        name: "duna-club-website",
        private: true,
        type: "module",
        dependencies: { "@neondatabase/serverless": "1.1.0" },
        engines: { node: "24.x" },
      }),
      encoding: "utf-8",
    },
    {
      file: "vercel.json",
      data: JSON.stringify({
        version: 2,
        routes: [{ src: "/(.*)", dest: "/api/site?path=$1" }],
      }),
      encoding: "utf-8",
    },
  ];
}
async function vercelProject(site: Site) {
  const name = `duna-club-${site.id}`;
  let project: { id: string; name: string; accountId: string };
  try {
    project = await request(
      "Vercel",
      `/v9/projects/${encodeURIComponent(site.vercelProjectId || name)}`,
    );
  } catch (error) {
    if (
      !(error instanceof ProviderError) ||
      error.status !== 404 ||
      site.vercelProjectId
    )
      throw error;
    project = await request("Vercel", "/v11/projects", "POST", {
      name,
      framework: null,
      publicSource: false,
      ssoProtection: null,
    });
  }
  if (project.name !== name || project.accountId !== configuration().teamId)
    throw new Error("Website hosting project ownership does not match.");
  await getDatabase()
    .update(websiteSites)
    .set({ vercelProjectId: project.id })
    .where(eq(websiteSites.id, site.id));
  return project;
}
type NeonProject = { id: string; name: string; org_id: string };
async function neonProject(site: Site) {
  const config = configuration(),
    name = `duna-club-${site.id}`;
  let project: NeonProject | undefined;
  if (site.neonProjectId)
    project = (
      await request<{ project: NeonProject }>(
        "Neon",
        `projects/${encodeURIComponent(site.neonProjectId)}`,
      )
    ).project;
  else {
    const matches: NeonProject[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await request<{
        projects: NeonProject[];
        unavailable_project_ids?: string[];
        pagination?: { cursor?: string };
      }>(
        "Neon",
        `projects?org_id=${encodeURIComponent(config.neonOrg)}&search=${encodeURIComponent(name)}&limit=400${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (result.unavailable_project_ids?.length)
        throw new Error(
          "Neon project discovery is incomplete; retry before creating hosting resources.",
        );
      matches.push(
        ...result.projects.filter(
          (p) => p.name === name && p.org_id === config.neonOrg,
        ),
      );
      const next = result.pagination?.cursor;
      if (!result.projects.length || !next) break;
      if (next === cursor || page === 19)
        throw new Error(
          "Neon project discovery is incomplete; retry before creating hosting resources.",
        );
      cursor = next;
    }
    if (matches.length > 1)
      throw new Error("Multiple website databases need reconciliation.");
    project = matches[0];
    if (!project)
      project = (
        await request<{ project: NeonProject }>("Neon", "projects", "POST", {
          project: {
            name,
            org_id: config.neonOrg,
            region_id: process.env.DUNA_SITES_NEON_REGION || "aws-us-east-2",
            pg_version: 17,
          },
        })
      ).project;
  }
  if (!project || project.name !== name || project.org_id !== config.neonOrg)
    throw new Error("Website database ownership does not match.");
  await getDatabase()
    .update(websiteSites)
    .set({ neonProjectId: project.id })
    .where(eq(websiteSites.id, site.id));
  return project;
}
async function siteDatabase(projectId: string) {
  const connection = await request<{ uri: string }>(
    "Neon",
    `projects/${encodeURIComponent(projectId)}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
  );
  const uri = new URL(connection.uri);
  if (
    !["postgres:", "postgresql:"].includes(uri.protocol) ||
    !uri.hostname.endsWith(".neon.tech")
  )
    throw new Error("Website database returned an invalid connection.");
  return { uri: connection.uri, sql: neon(connection.uri) };
}
async function storeRevision(
  projectId: string,
  revisionId: string,
  pages: readonly WebsitePublishPage[],
) {
  const { sql, uri } = await siteDatabase(projectId);
  await sql.query(
    "CREATE TABLE IF NOT EXISTS duna_site_revisions (id uuid PRIMARY KEY, content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
  );
  await sql.query(
    "CREATE TABLE IF NOT EXISTS duna_site_pages (revision_id uuid NOT NULL REFERENCES duna_site_revisions(id), path text NOT NULL, html text NOT NULL, PRIMARY KEY(revision_id,path))",
  );
  const existing = await sql.query(
    "SELECT content_hash FROM duna_site_revisions WHERE id=$1",
    [revisionId],
  );
  // Republish and rollback use the original approved snapshot, never today's catalog or domain data.
  if (existing.length) return uri;
  const hash = createHash("sha256").update(JSON.stringify(pages)).digest("hex");
  const result = await sql.transaction([
    sql.query(
      "INSERT INTO duna_site_revisions(id,content_hash) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id",
      [revisionId, hash],
    ),
    ...pages.map((p) =>
      sql.query(
        "INSERT INTO duna_site_pages(revision_id,path,html) SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM duna_site_revisions WHERE id=$1 AND content_hash=$4) ON CONFLICT DO NOTHING",
        [revisionId, p.path, p.html, hash],
      ),
    ),
    sql.query("SELECT content_hash FROM duna_site_revisions WHERE id=$1", [
      revisionId,
    ]),
  ]);
  const rows = result.at(-1) as { content_hash: string }[];
  if (rows[0]?.content_hash !== hash)
    throw new Error(
      "Published revisions are immutable. Create a new revision to change the website.",
    );
  return uri;
}
async function fencedPublishUpdate(
  siteId: string,
  leaseId: string,
  revisionId: string,
  action: (
    tx: Parameters<
      Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
    >[0],
  ) => Promise<void>,
) {
  return getTransactionalDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(websiteSites)
      .where(eq(websiteSites.id, siteId))
      .for("update");
    if (
      current?.publishLeaseId !== leaseId ||
      current.publishingRevisionId !== revisionId
    )
      return false;
    await action(tx);
    return true;
  });
}
export async function publishWebsiteRevision(
  actor: ApiActor,
  siteId: string,
  revisionId: string,
  pages: readonly WebsitePublishPage[],
) {
  const site = await ownedSite(actor, siteId, true);
  configuration();
  validatePublishPages(pages);
  if (!(await getWebsiteBilling(actor, siteId)).active)
    throw new Error("Activate your website subscription before publishing.");
  const db = getDatabase();
  const revision = await db.query.websiteRevisions.findFirst({
    where: and(
      eq(websiteRevisions.id, revisionId),
      eq(websiteRevisions.siteId, siteId),
      eq(websiteRevisions.organizationId, site.organizationId),
    ),
  });
  if (
    !revision ||
    !["draft", "published", "deploying", "failed"].includes(revision.status)
  )
    throw new Error("Choose a completed website draft to publish.");
  if (
    site.publishingRevisionId === revisionId &&
    site.provisioningStatus === "deploying"
  )
    return readPublishStatus(actor, siteId);
  const leaseId = randomUUID();
  const claimed = await getTransactionalDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(websiteSites)
      .where(eq(websiteSites.id, siteId))
      .for("update");
    if (
      !current ||
      current.provisioningStatus === "deploying" ||
      (current.publishLeaseId &&
        current.publishLeaseExpiresAt &&
        current.publishLeaseExpiresAt > new Date())
    )
      return null;
    await tx
      .update(websiteSites)
      .set({
        provisioningStatus: "provisioning",
        publishingRevisionId: revisionId,
        publishLeaseId: leaseId,
        publishLeaseExpiresAt: new Date(Date.now() + 600_000),
        updatedAt: new Date(),
      })
      .where(eq(websiteSites.id, siteId));
    return current;
  });
  if (!claimed)
    throw new Error(
      "Website publishing is already in progress. Check its status shortly.",
    );
  let deploymentRequested = false;
  try {
    const project = await vercelProject(claimed),
      databaseProject = await neonProject(claimed);
    const uri = await storeRevision(databaseProject.id, revisionId, pages);
    await request(
      "Vercel",
      `/v10/projects/${encodeURIComponent(project.id)}/env?upsert=true`,
      "POST",
      {
        key: "DATABASE_URL",
        value: uri,
        type: "encrypted",
        target: ["production", "preview"],
      },
    );
    const accepted = await fencedPublishUpdate(
      siteId,
      leaseId,
      revisionId,
      async (tx) => {
        await tx
          .update(websiteSites)
          .set({ provisioningStatus: "deploying", updatedAt: new Date() })
          .where(eq(websiteSites.id, siteId));
        await tx
          .update(websiteRevisions)
          .set({
            status: "deploying",
            deploymentId: null,
            deploymentUrl: null,
            leaseExpiresAt: null,
            error: null,
          })
          .where(eq(websiteRevisions.id, revisionId));
      },
    );
    if (!accepted)
      throw new Error("Publishing was superseded by a newer request.");
    deploymentRequested = true;
    const deployment = await request<Deployment>(
      "Vercel",
      "/v13/deployments",
      "POST",
      {
        name: project.name,
        project: project.id,
        target: "production",
        files: websiteRuntimeFiles(revisionId),
        projectSettings: {
          framework: null,
          buildCommand: null,
          installCommand: "npm install --omit=dev",
          nodeVersion: "24.x",
        },
        meta: {
          dunaWebsiteId: siteId,
          dunaOrganizationId: site.organizationId,
          dunaRevisionId: revisionId,
          dunaPublishId: leaseId,
        },
      },
    );
    const deploymentId = deployment.id || deployment.uid;
    if (!deploymentId)
      throw new Error("Hosting did not return a deployment identifier.");
    await fencedPublishUpdate(siteId, leaseId, revisionId, async (tx) => {
      await tx
        .update(websiteRevisions)
        .set({
          deploymentId,
          deploymentUrl: `https://${deployment.url}`,
          status: "deploying",
          error: null,
        })
        .where(eq(websiteRevisions.id, revisionId));
    });
    return {
      status: "deploying",
      deploymentId,
      url: `https://${deployment.url}`,
      revisionId,
    };
  } catch (error) {
    // An uncertain deployment result remains fenced until provider reconciliation.
    if (!deploymentRequested)
      await fencedPublishUpdate(siteId, leaseId, revisionId, async (tx) => {
        await tx
          .update(websiteSites)
          .set({
            provisioningStatus: "needs-attention",
            publishLeaseId: null,
            publishLeaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(websiteSites.id, siteId));
      });
    throw error instanceof ProviderError
      ? error
      : new Error(
          "Website publishing could not finish. Check publishing status to resume safely.",
        );
  }
}
export async function readPublishStatus(actor: ApiActor, siteId: string) {
  const site = await ownedSite(actor, siteId);
  const db = getDatabase();
  if (
    !site.publishingRevisionId ||
    !site.publishLeaseId ||
    site.provisioningStatus !== "deploying"
  )
    return {
      status: site.provisioningStatus,
      revisionId: site.publishedRevisionId,
      url: site.domain
        ? `https://${site.domain}`
        : site.publishedRevisionId
          ? `https://duna-club-${site.id}.vercel.app`
          : null,
      hosting: websiteHostingReadiness(),
    };
  const revision = await db.query.websiteRevisions.findFirst({
    where: and(
      eq(websiteRevisions.id, site.publishingRevisionId),
      eq(websiteRevisions.siteId, siteId),
    ),
  });
  if (!revision) throw new Error("Publishing revision was not found.");
  let deployment: Deployment | undefined;
  if (revision.deploymentId)
    deployment = await request<Deployment>(
      "Vercel",
      `/v13/deployments/${encodeURIComponent(revision.deploymentId)}`,
    );
  else {
    const listed = await request<{ deployments: Deployment[] }>(
      "Vercel",
      `/v6/deployments?projectId=${encodeURIComponent(site.vercelProjectId!)}&limit=100&meta-dunaPublishId=${encodeURIComponent(site.publishLeaseId)}`,
    );
    const recovered = listed.deployments.find(
      (d) => d.meta?.dunaPublishId === site.publishLeaseId,
    );
    const id = recovered?.id || recovered?.uid;
    if (id) {
      deployment = await request<Deployment>(
        "Vercel",
        `/v13/deployments/${encodeURIComponent(id)}`,
      );
      await fencedPublishUpdate(
        siteId,
        site.publishLeaseId,
        revision.id,
        async (tx) => {
          await tx
            .update(websiteRevisions)
            .set({
              deploymentId: id,
              deploymentUrl: `https://${deployment!.url}`,
            })
            .where(eq(websiteRevisions.id, revision.id));
        },
      );
    }
  }
  if (!deployment) {
    // A missing list result is not proof that a timed-out creation was rejected.
    // Preserve the fence and keep reconciling; never create a competing release.

    return {
      status:
        site.publishLeaseExpiresAt && site.publishLeaseExpiresAt < new Date()
          ? "needs-attention"
          : "deploying",
      revisionId: revision.id,
      url: null,
    };
  }
  const deploymentId = deployment.id || deployment.uid || revision.deploymentId;
  if (
    deployment.projectId !== site.vercelProjectId ||
    deployment.meta?.dunaWebsiteId !== siteId ||
    deployment.meta?.dunaRevisionId !== revision.id ||
    deployment.meta?.dunaPublishId !== site.publishLeaseId
  )
    throw new Error("Website deployment ownership does not match.");
  const state = deployment.readyState || deployment.state;
  if (state === "READY") {
    const response = await fetch(`https://${deployment.url}/`, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok || response.headers.get("x-duna-revision") !== revision.id)
      throw new Error(
        "The website is built but its live health check has not passed yet. Check again shortly.",
      );
    // Vercel truncates its automatic default alias for long project names.
    // Assign our full UUID hostname explicitly, refusing to move another project's alias.
    const managedHost = `duna-club-${site.id}.vercel.app`;
    let propagationUntil = revision.leaseExpiresAt;
    const aliasApplied = await fencedPublishUpdate(
      siteId,
      site.publishLeaseId,
      revision.id,
      async (tx) => {
        let managedAlias:
          { projectId?: string; deploymentId?: string } | undefined;
        try {
          managedAlias = await request(
            "Vercel",
            `/v4/aliases/${encodeURIComponent(managedHost)}`,
          );
        } catch (error) {
          if (!(error instanceof ProviderError) || error.status !== 404)
            throw error;
        }
        if (managedAlias && managedAlias.projectId !== site.vercelProjectId)
          throw new Error(
            "Website address belongs to another hosting project.",
          );
        if (managedAlias?.deploymentId !== deploymentId) {
          await request(
            "Vercel",
            `/v2/deployments/${encodeURIComponent(deploymentId!)}/aliases`,
            "POST",
            { alias: managedHost },
          );
          propagationUntil = new Date(Date.now() + 30_000);
          await tx
            .update(websiteRevisions)
            .set({ leaseExpiresAt: propagationUntil })
            .where(eq(websiteRevisions.id, revision.id));
        }
      },
    );
    if (!aliasApplied)
      return { status: "superseded", revisionId: revision.id, url: null };
    if (propagationUntil && propagationUntil > new Date())
      return {
        status: "deploying",
        revisionId: revision.id,
        deploymentId,
        url: `https://${managedHost}`,
      };
    const aliases = await request<{ aliases: { alias: string }[] }>(
      "Vercel",
      `/v2/deployments/${encodeURIComponent(deploymentId!)}/aliases`,
    );
    const host = site.domain || managedHost;
    if (
      !aliases.aliases.some((entry) => entry.alias === host) ||
      !aliases.aliases.some((entry) => entry.alias === managedHost)
    )
      throw new Error(
        "The website is built but its production address is still updating. Check again shortly.",
      );
    // Probe only provider-controlled hosts; customer DNS must never become a server-side fetch target.
    if (site.domain) {
      const domainState = await request<{ misconfigured: boolean }>(
        "Vercel",
        `/v6/domains/${encodeURIComponent(site.domain)}/config?projectIdOrName=${encodeURIComponent(site.vercelProjectId!)}`,
      );
      if (domainState.misconfigured)
        throw new Error(
          "The website is built but its production address is still updating. Check again shortly.",
        );
    }
    const live = await fetch(`https://${managedHost}/`, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!live.ok || live.headers.get("x-duna-revision") !== revision.id)
      throw new Error(
        "The website is built but its production address is still updating. Check again shortly.",
      );
    if (!(await finish("published")))
      return { status: "superseded", revisionId: revision.id, url: null };
    return {
      status: "published",
      revisionId: revision.id,
      deploymentId,
      url: `https://${host}`,
    };
  }
  if (state === "ERROR" || state === "CANCELED") {
    await finish("failed");
    return {
      status: "failed",
      revisionId: revision.id,
      deploymentId,
      url: null,
    };
  }
  return {
    status: "deploying",
    revisionId: revision.id,
    deploymentId,
    url: `https://${deployment.url}`,
  };
  async function finish(status: "published" | "failed") {
    return fencedPublishUpdate(
      siteId,
      site.publishLeaseId!,
      revision!.id,
      async (tx) => {
        await tx
          .update(websiteRevisions)
          .set({
            status,
            error:
              status === "failed"
                ? "Hosting could not finish this revision. Retry publishing."
                : null,
          })
          .where(eq(websiteRevisions.id, revision!.id));
        await tx
          .update(websiteSites)
          .set({
            ...(status === "published"
              ? { publishedRevisionId: revision!.id }
              : {}),
            provisioningStatus:
              status === "published" ? "published" : "needs-attention",
            publishingRevisionId: null,
            publishLeaseId: null,
            publishLeaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(websiteSites.id, siteId));
      },
    );
  }
}
export async function connectWebsiteDomain(
  actor: ApiActor,
  siteId: string,
  domain: string,
) {
  const site = await ownedSite(actor, siteId, true);
  const name = normalizeWebsiteDomain(domain);
  configuration();
  if (!(await getWebsiteBilling(actor, siteId)).active)
    throw new Error(
      "Activate your website subscription before connecting a domain.",
    );
  if (!site.vercelProjectId)
    throw new Error("Publish your website before connecting its domain.");
  await vercelProject(site);
  type Domain = {
    name: string;
    verified: boolean;
    verification?: {
      type: string;
      domain: string;
      value: string;
      reason?: string;
    }[];
  };
  let result: Domain;
  try {
    result = await request(
      "Vercel",
      `/v9/projects/${encodeURIComponent(site.vercelProjectId)}/domains/${encodeURIComponent(name)}`,
    );
  } catch (error) {
    if (!(error instanceof ProviderError) || error.status !== 404) throw error;
    result = await request(
      "Vercel",
      `/v10/projects/${encodeURIComponent(site.vercelProjectId)}/domains`,
      "POST",
      { name },
    );
  }
  if (!result.verified) {
    try {
      result = await request(
        "Vercel",
        `/v9/projects/${encodeURIComponent(site.vercelProjectId)}/domains/${encodeURIComponent(name)}/verify`,
        "POST",
      );
    } catch (error) {
      if (
        !(error instanceof ProviderError) ||
        ![400, 409].includes(error.status)
      )
        throw error;
    }
  }
  const config = await request<{
    misconfigured: boolean;
    recommendedCNAME?: { rank: number; value: string }[];
    recommendedIPv4?: { rank: number; value: string[] }[];
  }>(
    "Vercel",
    `/v6/domains/${encodeURIComponent(name)}/config?projectIdOrName=${encodeURIComponent(site.vercelProjectId)}`,
  );
  const ready = result.verified && !config.misconfigured;
  // Keep the currently working URL until ownership and DNS both pass.
  if (ready)
    await getDatabase()
      .update(websiteSites)
      .set({ domain: name, updatedAt: new Date() })
      .where(eq(websiteSites.id, siteId));
  return {
    domain: name,
    verified: result.verified,
    ready,
    verification: result.verification ?? [],
    dnsRecords: (config.recommendedIPv4 ?? []).some(
      (r) => Number(r.rank) === 1 && r.value.length,
    )
      ? (config.recommendedIPv4 ?? [])
          .filter((r) => Number(r.rank) === 1)
          .flatMap((r) => r.value.map((value) => ({ type: "A", name, value })))
      : (config.recommendedCNAME ?? [])
          .filter((r) => Number(r.rank) === 1)
          .map((r) => ({ type: "CNAME", name, value: r.value })),
    dnsManagedExternally: true,
    instructions: ready
      ? "Your domain is connected."
      : "Update this domain's DNS with your domain provider, then check again. Preserve your existing email records.",
  };
}
export const rollbackWebsiteRevision = publishWebsiteRevision;
