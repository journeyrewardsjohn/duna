"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Globe2,
  History,
  LoaderCircle,
  Monitor,
  Plus,
  Smartphone,
} from "lucide-react";
import styles from "./website-studio.module.css";

type Site = {
  id: string;
  name: string;
  brief: string;
  sourceUrl: string | null;
  inspirationUrls: string[];
  domain: string | null;
  publishedRevisionId: string | null;
  provisioningStatus: string;
  vercelProjectId: string | null;
};
type Revision = {
  id: string;
  brief: string;
  status: string;
  error: string | null;
  createdAt: string;
  deploymentUrl: string | null;
  document: {
    changeSummary?: string;
    pages?: { slug: string; title: string }[];
  };
};
type Detail = {
  site: Site;
  revisions: Revision[];
  billing: {
    status: string;
    active: boolean;
    creditsAvailable: number;
    monthlyCredits: number;
    checkoutConfigured: boolean;
    cancelAtPeriodEnd: boolean;
    periodEndsAt: string | null;
  };
  editCredits: number;
  generationAvailable: boolean;
  hostingAvailable: boolean;
};
const working = new Set(["preparing", "queued", "generating", "generated"]);
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}
export function WebsiteStudio({
  clubName,
  initialSiteId,
  demo,
  canManageBilling,
}: {
  clubName: string;
  initialSiteId?: string;
  demo: boolean;
  canManageBilling: boolean;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(initialSiteId || "");
  const activeSiteId = useRef(initialSiteId || "");
  function selectSite(id: string) {
    activeSiteId.current = id;
    setDetail(null);
    setSiteId(id);
    setPublishReview(false);
    setCancelReview(false);
    window.history.replaceState(
      null,
      "",
      id ? `/website?site=${encodeURIComponent(id)}` : "/website",
    );
  }
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(clubName);
  const [brief, setBrief] = useState("");
  const [source, setSource] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedRevision, setSelectedRevision] = useState("");
  const [page, setPage] = useState("home");
  const [mobile, setMobile] = useState(false);
  const [history, setHistory] = useState(false);
  const [publishReview, setPublishReview] = useState(false);
  const [cancelReview, setCancelReview] = useState(false);
  const cancelDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (cancelReview) cancelDialogRef.current?.showModal();
    else cancelDialogRef.current?.close();
  }, [cancelReview]);
  const [domain, setDomain] = useState("");
  const [domainResult, setDomainResult] = useState<{
    message?: string;
    instructions?: string;
    ready?: boolean;
    verified?: boolean;
    dnsRecords?: { type: string; name: string; value: string }[];
    verification?: {
      type: string;
      domain: string;
      value: string;
      reason?: string;
    }[];
  } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const publishDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (publishReview) publishDialogRef.current?.showModal();
    else publishDialogRef.current?.close();
  }, [publishReview]);
  const activeRevision = detail?.revisions.find((revision) =>
    working.has(revision.status),
  );
  const deploying =
    detail?.site.provisioningStatus === "deploying" ||
    detail?.revisions.some((revision) => revision.status === "deploying");
  const preview = detail?.revisions.find(
    (revision) => revision.id === selectedRevision,
  );
  const ready =
    detail?.revisions.filter((revision) =>
      ["draft", "published", "deploying"].includes(revision.status),
    ) || [];
  const refresh = useCallback(async (id: string, status = false) => {
    const data = await api<Detail>(
      `/api/websites?siteId=${encodeURIComponent(id)}${status ? "&status=1" : ""}`,
    );
    if (activeSiteId.current !== id) return data;
    setDetail(data);
    setSelectedRevision((current) =>
      data.revisions.some((revision) => revision.id === current)
        ? current
        : data.revisions.find((revision) =>
            ["draft", "published", "deploying"].includes(revision.status),
          )?.id || "",
    );
    return data;
  }, []);
  useEffect(() => {
    if (demo) return;
    let current = true;
    api<{ sites: Site[] }>("/api/websites")
      .then((data) => {
        if (current) {
          setSites(data.sites);
          if (!initialSiteId && data.sites[0]) selectSite(data.sites[0].id);
        }
      })
      .catch((err) => {
        if (current) setError(err.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [demo, initialSiteId]);
  useEffect(() => {
    if (!siteId || demo) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError("");
    setSelectedRevision("");
    setPage("home");
    refresh(siteId)
      .catch((err) => {
        if (activeSiteId.current === siteId) setError(err.message);
      })
      .finally(() => {
        if (activeSiteId.current === siteId) setLoading(false);
      });
  }, [siteId, demo, refresh]);
  useEffect(() => {
    if (!siteId || (!activeRevision && !deploying)) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh(siteId, Boolean(deploying)).catch((err) => {
          if (activeSiteId.current === siteId) setError(err.message);
        });
    }, 4000);
    return () => clearInterval(timer);
  }, [siteId, activeRevision, deploying, refresh]);
  async function act(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function generate(id: string, text: string) {
    await api("/api/websites", {
      action: "generate",
      siteId: id,
      prompt: text,
      operationId: crypto.randomUUID(),
    });
    setPrompt("");
    await refresh(id);
    setNotice(
      "Duna is building your preview. You can leave this page and return later.",
    );
  }
  const [referenceEditing, setReferenceEditing] = useState(false);
  const published = detail?.revisions.find(
    (revision) => revision.id === detail.site.publishedRevisionId,
  );
  const liveUrl =
    published?.deploymentUrl && /^https:\/\//.test(published.deploymentUrl)
      ? published.deploymentUrl
      : null;
  const chosenPages = preview?.document.pages || [];
  return (
    <main className={`hq-page ${styles.workspace}`}>
      <header className={styles.header}>
        <div>
          <h1>Website</h1>
        </div>
        {sites.length > 0 && (
          <div className={styles.switcher}>
            <label className={styles.srOnly} htmlFor="website-choice">
              Choose website
            </label>
            <select
              id="website-choice"
              value={siteId}
              onChange={(event) => selectSite(event.target.value)}
            >
              <option value="">New website</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Create another website"
              onClick={() => selectSite("")}
            >
              <Plus size={20} />
            </button>
          </div>
        )}
      </header>
      {error && (
        <div className={styles.alert} role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              if (siteId)
                void refresh(siteId).catch((err) => setError(err.message));
            }}
          >
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {demo && (
        <p className={styles.notice}>
          You’re viewing sample club data. Sign in to your club to generate and
          publish a website.
        </p>
      )}
      {loading ? (
        <div className={styles.loading} role="status">
          <LoaderCircle size={24} /> Opening your studio…
        </div>
      ) : !siteId ? (
        <section className={styles.start}>
          <form
            className={styles.brief}
            onSubmit={(event) => {
              event.preventDefault();
              void act("create", async () => {
                const result = await api<{ site: Site }>("/api/websites", {
                  action: "create",
                  name,
                  brief,
                  sourceUrl: source || undefined,
                  inspirationUrls: inspiration
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                });
                setSites((current) => [result.site, ...current]);
                selectSite(result.site.id);
                await generate(result.site.id, brief);
              });
            }}
          >
            <h2>Create a website</h2>
            <p>
              Describe the pages and design you need. Duna uses your club’s
              configured programs, bookings and account links.
            </p>
            <label htmlFor="site-name">Website name</label>
            <input
              id="site-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              minLength={2}
            />
            <label htmlFor="site-brief">Tell Duna about your website</label>
            <textarea
              id="site-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              required
              minLength={10}
              maxLength={6000}
              rows={5}
              placeholder="A welcoming website for our beach volleyball club. Lead with youth programs, make court booking easy, and use large photos with a clean, warm feel."
            />
            <details className={styles.references}>
              <summary>Existing website and design references</summary>
              <label htmlFor="site-source">
                Your current website <span>Optional</span>
              </label>
              <input
                id="site-source"
                type="url"
                placeholder="https://yourclub.com"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <label htmlFor="site-inspiration">
                Design references <span>Up to 3, one per line</span>
              </label>
              <textarea
                id="site-inspiration"
                rows={3}
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                placeholder="https://a-site-you-love.com"
              />
              <p>
                We use these for direction and structure. Your club keeps its
                own identity.
              </p>
            </details>
            <button
              className={styles.primary}
              disabled={Boolean(busy) || demo}
              type="submit"
            >
              {busy && <LoaderCircle size={18} />}{" "}
              {busy ? "Starting your website…" : "Create preview"}
            </button>
            <small>
              No payment to preview. Review your site before subscribing or
              publishing.
            </small>
          </form>
          <aside className={styles.promise}>
            <h2>Hosting and editing</h2>
            <ul>
              <li>Programs, leagues, tournaments and lessons</li>
              <li>Duna booking, sign-in and wallet links</li>
              <li>Hosted website with a custom domain option</li>
              <li>AI edits with preview and version history</li>
            </ul>
            <div className={styles.price}>
              <strong>
                $200 <span>/ month per website</span>
              </strong>
              <p>
                Hosting and 1,000 AI credits included. A standard edit uses 25
                credits. Existing Duna plan and payment fees are separate.
              </p>
            </div>
          </aside>
        </section>
      ) : detail ? (
        <>
          <div className={styles.siteBar}>
            <div>
              <span className={styles.statusDot} />
              <strong>{detail.site.name}</strong>
              <span>
                {detail.site.publishedRevisionId
                  ? "Published"
                  : "Not published"}
              </span>
              {detail.site.domain && <span>{detail.site.domain}</span>}
            </div>
            <div>
              {liveUrl && (
                <a
                  className={styles.secondary}
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View live site <ExternalLink size={16} />
                </a>
              )}
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setHistory((value) => !value)}
                aria-expanded={history}
              >
                <History size={17} /> Versions
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={
                  !preview ||
                  Boolean(busy) ||
                  Boolean(deploying) ||
                  !detail.billing.active ||
                  !canManageBilling ||
                  !detail.hostingAvailable
                }
                onClick={() => setPublishReview(true)}
              >
                {deploying ? "Publishing…" : "Review & publish"}
              </button>
            </div>
          </div>
          <section className={styles.studio} aria-label="Website studio">
            <div className={styles.conversation}>
              <div className={styles.conversationHeading}>
                <h2>Edit website</h2>
              </div>
              <div className={styles.messages}>
                <div className={styles.assistant}>
                  Your site uses your club’s public offerings. Tell me what to
                  change; review the preview before publishing.
                </div>
                {[...detail.revisions].reverse().map((revision) => (
                  <div key={revision.id} className={styles.exchange}>
                    <div className={styles.owner}>
                      <span>You</span>
                      <p>{revision.brief}</p>
                    </div>
                    <div className={styles.assistant}>
                      <span>Duna</span>
                      {working.has(revision.status) ? (
                        <p role="status">
                          <LoaderCircle size={16} /> Building your preview…
                        </p>
                      ) : revision.status === "failed" ? (
                        <p>
                          {revision.error ||
                            "This edit couldn’t be completed. Try again."}
                        </p>
                      ) : (
                        <>
                          <p>
                            {revision.document.changeSummary ||
                              "Your preview is ready to review."}
                          </p>
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() => {
                              setSelectedRevision(revision.id);
                              setPage("home");
                            }}
                          >
                            View this version <ArrowUp size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form
                className={styles.composer}
                onSubmit={(event) => {
                  event.preventDefault();
                  void act("generate", () => generate(siteId, prompt));
                }}
              >
                <label htmlFor="website-prompt" className={styles.srOnly}>
                  Describe your website edit
                </label>
                <textarea
                  id="website-prompt"
                  ref={promptRef}
                  rows={3}
                  placeholder={
                    ready.length
                      ? "Make the homepage more welcoming to families…"
                      : "Tell Duna what to build…"
                  }
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  minLength={5}
                  maxLength={6000}
                  required
                  disabled={Boolean(activeRevision)}
                />
                <div>
                  <small>
                    {ready.length
                      ? `${detail.editCredits} credits per edit · ${detail.billing.creditsAvailable.toLocaleString()} available`
                      : "Your first preview is free"}
                  </small>
                  <button
                    type="submit"
                    className={styles.send}
                    aria-label="Generate website preview"
                    disabled={
                      Boolean(busy) ||
                      Boolean(activeRevision) ||
                      !detail.generationAvailable ||
                      (ready.length > 0 &&
                        (!detail.billing.active ||
                          detail.billing.creditsAvailable < detail.editCredits))
                    }
                  >
                    <ArrowUp size={20} />
                  </button>
                </div>
                {!detail.generationAvailable && (
                  <p>
                    Generation is temporarily unavailable. Saved previews are
                    still here.
                  </p>
                )}
              </form>
            </div>
            <div className={styles.previewPanel}>
              <div className={styles.previewToolbar}>
                <div>
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label="Desktop preview"
                    aria-pressed={!mobile}
                    onClick={() => setMobile(false)}
                  >
                    <Monitor size={19} />
                  </button>
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label="Mobile preview"
                    aria-pressed={mobile}
                    onClick={() => setMobile(true)}
                  >
                    <Smartphone size={19} />
                  </button>
                </div>
                <label className={styles.srOnly} htmlFor="preview-page">
                  Preview page
                </label>
                <select
                  id="preview-page"
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                  disabled={!chosenPages.length}
                >
                  {chosenPages.length ? (
                    chosenPages.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.title}
                      </option>
                    ))
                  ) : (
                    <option>Preview</option>
                  )}
                </select>
                <span>Draft preview</span>
              </div>
              <div className={styles.previewCanvas}>
                {preview ? (
                  <iframe
                    key={`${preview.id}:${page}`}
                    className={
                      mobile ? styles.mobilePreview : styles.desktopPreview
                    }
                    title={`${detail.site.name} — ${page} preview`}
                    src={`/api/websites?siteId=${encodeURIComponent(siteId)}&preview=${encodeURIComponent(preview.id)}&page=${encodeURIComponent(page)}`}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                ) : (
                  <div className={styles.previewEmpty}>
                    <Globe2 size={44} />
                    <h2>
                      {activeRevision
                        ? "Your next chapter is taking shape."
                        : "Your website starts here."}
                    </h2>
                    <p>
                      {activeRevision
                        ? "Duna is bringing your brief and club offerings together. Your preview will appear here."
                        : "Describe your vision in the conversation to create a preview."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
          {history && (
            <section className={styles.history}>
              <h2>Version history</h2>
              <p>
                Preview any completed version. Publishing it restores that exact
                version.
              </p>
              {ready.length ? (
                ready.map((revision, index) => (
                  <button
                    key={revision.id}
                    type="button"
                    onClick={() => {
                      setSelectedRevision(revision.id);
                      setPage("home");
                    }}
                    aria-pressed={selectedRevision === revision.id}
                  >
                    <span>
                      <strong>
                        {revision.id === detail.site.publishedRevisionId
                          ? "Live version"
                          : `Version ${ready.length - index}`}
                      </strong>
                      <span>{revision.document.changeSummary}</span>
                    </span>
                    <time dateTime={revision.createdAt}>
                      {new Date(revision.createdAt).toLocaleString()}
                    </time>
                  </button>
                ))
              ) : (
                <p>Your first completed preview will appear here.</p>
              )}
            </section>
          )}
          <details
            className={styles.history}
            open={referenceEditing}
            onToggle={(event) => setReferenceEditing(event.currentTarget.open)}
          >
            <summary
              onClick={() => {
                if (!referenceEditing) {
                  setBrief(detail.site.brief);
                  setSource(detail.site.sourceUrl || "");
                  setInspiration(
                    (detail.site.inspirationUrls || []).join("\n"),
                  );
                }
              }}
            >
              Website brief & references
            </summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act("references", async () => {
                  await api("/api/websites", {
                    action: "references",
                    siteId,
                    brief,
                    sourceUrl: source || undefined,
                    inspirationUrls: inspiration
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  });
                  await refresh(siteId);
                  setNotice(
                    "References saved. Your next edit will use this direction.",
                  );
                });
              }}
            >
              <label htmlFor="edit-brief">Website direction</label>
              <textarea
                id="edit-brief"
                rows={3}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                minLength={10}
                maxLength={6000}
                required
              />
              <label htmlFor="edit-source">Your existing website</label>
              <input
                id="edit-source"
                type="url"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://yourclub.com"
              />
              <label htmlFor="edit-inspiration">
                Inspiration websites · up to 3, one per line
              </label>
              <textarea
                id="edit-inspiration"
                rows={3}
                value={inspiration}
                onChange={(event) => setInspiration(event.target.value)}
              />
              <button
                className={styles.secondary}
                type="submit"
                disabled={Boolean(busy) || Boolean(activeRevision)}
              >
                Save references
              </button>
            </form>
          </details>
          <section className={styles.settings}>
            <div className={styles.settingCard}>
              <h2>Your website plan</h2>
              {!detail.hostingAvailable && (
                <p role="status">
                  Hosting setup is in progress. You can build a free preview;
                  subscriptions and publishing will open when hosting is
                  connected.
                </p>
              )}
              <strong className={styles.planPrice}>
                $200 <span>/ month</span>
              </strong>
              <p>
                Dedicated hosting, your domain, and{" "}
                {detail.billing.monthlyCredits.toLocaleString()} AI credits each
                month. Booking and wallet stay connected to Duna. Credits renew
                monthly, do not roll over, and are separate from player wallet
                balances.
              </p>
              {detail.billing.active ? (
                <>
                  {canManageBilling && !detail.billing.cancelAtPeriodEnd && (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setError("");
                        setCancelReview(true);
                      }}
                    >
                      Cancel website plan
                    </button>
                  )}
                  <p>
                    <strong>
                      {detail.billing.creditsAvailable.toLocaleString()} credits
                      available
                    </strong>
                    {detail.billing.cancelAtPeriodEnd &&
                      " · Cancels at the end of this billing period"}
                  </p>
                  {canManageBilling && (
                    <button
                      className={styles.secondary}
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void act("billing", async () => {
                          const result = await api<{ url: string }>(
                            "/api/websites",
                            { action: "billing", siteId },
                          );
                          window.location.assign(result.url);
                        })
                      }
                    >
                      Manage subscription <ExternalLink size={16} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p>
                    Subscribe when you’re ready to publish. Further edits use
                    your included credits.
                  </p>
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={
                      !canManageBilling ||
                      Boolean(busy) ||
                      !detail.billing.checkoutConfigured ||
                      !detail.hostingAvailable
                    }
                    onClick={() =>
                      void act("checkout", async () => {
                        const result = await api<{ url: string }>(
                          "/api/websites",
                          {
                            action: "checkout",
                            siteId,
                            operationId: crypto.randomUUID(),
                          },
                        );
                        window.location.assign(result.url);
                      })
                    }
                  >
                    Subscribe · $200/month
                  </button>
                  {!canManageBilling && (
                    <small>A club owner can activate billing.</small>
                  )}
                  {!detail.billing.checkoutConfigured && (
                    <small>Billing is temporarily unavailable.</small>
                  )}
                </>
              )}
            </div>
            <form
              className={styles.settingCard}
              onSubmit={(event) => {
                event.preventDefault();
                void act("domain", async () => {
                  const result = await api<NonNullable<typeof domainResult>>(
                    "/api/websites",
                    { action: "domain", siteId, domain },
                  );
                  setDomainResult(result);
                  await refresh(siteId);
                  setNotice(
                    "Domain details updated. Complete any DNS steps shown below.",
                  );
                });
              }}
            >
              <h2>Domain</h2>
              <p>
                Your hosted address is created when you publish. Connect a
                domain or subdomain you own when you’re ready.
              </p>
              <label htmlFor="website-domain">Custom domain</label>
              <input
                id="website-domain"
                placeholder="www.yourclub.com"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                required
              />
              <button
                type="submit"
                className={styles.secondary}
                disabled={
                  Boolean(busy) ||
                  !detail.site.vercelProjectId ||
                  !canManageBilling
                }
              >
                Connect domain
              </button>
              {!canManageBilling && (
                <small>
                  A club owner can publish your preview and connect a domain.
                </small>
              )}
              {domainResult && (
                <div role="status">
                  <p>
                    {domainResult.instructions ||
                      domainResult.message ||
                      (domainResult.verified
                        ? "Domain ownership verified."
                        : "Domain added. DNS verification may still be required.")}
                  </p>
                  {domainResult.dnsRecords?.map((record) => (
                    <div
                      className={styles.dns}
                      key={`${record.type}:${record.name}:${record.value}`}
                    >
                      <strong>{record.type} · Website routing</strong>
                      <code>{record.name}</code>
                      <code>{record.value}</code>
                    </div>
                  ))}
                  {domainResult.verification?.map((record) => (
                    <div
                      className={styles.dns}
                      key={`${record.type}:${record.domain}`}
                    >
                      <strong>{record.type}</strong>
                      <code>{record.domain}</code>
                      <code>{record.value}</code>
                    </div>
                  ))}
                </div>
              )}
              {!detail.site.vercelProjectId && (
                <small>Publish your first version to set up hosting.</small>
              )}
            </form>
          </section>
          {cancelReview && (
            <dialog
              ref={cancelDialogRef}
              onCancel={() => setCancelReview(false)}
              className={styles.publishReview}
              aria-labelledby="cancel-website-title"
            >
              <button
                type="button"
                className={styles.textButton}
                onClick={() => setCancelReview(false)}
              >
                Keep my plan
              </button>
              <h2 id="cancel-website-title">
                Cancel the website subscription?
              </h2>
              <p>
                Your $200/month website plan will not renew. Paid access
                continues through{" "}
                {detail.billing.periodEndsAt
                  ? new Date(detail.billing.periodEndsAt).toLocaleDateString()
                  : "the end of the current billing period"}
                . This does not cancel your club’s Duna plan, player
                memberships, or bookings.
              </p>
              {error && (
                <p role="alert" className={styles.alert}>
                  {error}
                </p>
              )}
              <button
                type="button"
                className={styles.primary}
                disabled={Boolean(busy)}
                onClick={() =>
                  void act("cancel-subscription", async () => {
                    await api("/api/websites", {
                      action: "cancel-subscription",
                      siteId,
                    });
                    await refresh(siteId);
                    setCancelReview(false);
                    setNotice(
                      "Your website plan will end after this billing period and will not renew.",
                    );
                  })
                }
              >
                {busy === "cancel-subscription"
                  ? "Updating subscription…"
                  : "Cancel at period end"}
              </button>
            </dialog>
          )}
          {publishReview && (
            <dialog
              ref={publishDialogRef}
              onCancel={() => setPublishReview(false)}
              className={styles.publishReview}

              aria-labelledby="publish-title"
            >
              <button
                type="button"
                className={styles.textButton}
                onClick={() => setPublishReview(false)}
              >
                <ArrowLeft size={16} /> Back to preview
              </button>
              <h2 id="publish-title">Publish website?</h2>
              {error && (
                <p role="alert" className={styles.alert}>
                  {error}
                </p>
              )}
              <p>
                This publishes the version you’re previewing for{" "}
                <strong>{detail.site.name}</strong>. Visitors will see these
                changes as soon as deployment completes.
              </p>
              <p>{preview?.document.changeSummary}</p>
              <p>
                Booking, account and wallet links open the secure Duna
                experience.
              </p>
              <button
                autoFocus
                type="button"
                className={styles.primary}
                disabled={Boolean(busy)}
                onClick={() =>
                  void act("publish", async () => {
                    await api("/api/websites", {
                      action: "publish",
                      siteId,
                      revisionId: selectedRevision,
                    });
                    setPublishReview(false);
                    await refresh(siteId, true);
                    setNotice(
                      "Publishing started. We’ll show the live status once deployment is ready.",
                    );
                  })
                }
              >
                {busy === "publish"
                  ? "Starting deployment…"
                  : "Publish this version"}
              </button>
            </dialog>
          )}
        </>
      ) : (
        <div className={styles.loading}>
          <p>We couldn’t open this website.</p>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => selectSite("")}
          >
            Back to websites
          </button>
        </div>
      )}
    </main>
  );
}
