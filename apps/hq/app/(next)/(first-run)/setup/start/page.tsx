import { HQ_PLAN_OPTIONS, HQ_TERMS_VERSION, type HqPlan } from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { formatMoney, ORGANIZATION_PLANS } from "@duna/core";
import { Button, NotConfigured } from "@duna/ui/tideline";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
import type { Metadata } from "next";
import { CreateClubForm } from "@/components/setup/create-club-form";
import {
  FirstRunFlow,
  type FirstRunPath,
} from "@/components/setup/first-run-flow";
import {
  describeStatus,
  loadLatestRun,
  loadProfile,
  websiteReaderStatus,
} from "@/components/setup/setup-data";
import { normaliseWebsiteInput } from "@/components/setup/setup-model";
import { SETUP_SCOPE } from "@/components/setup/setup-screen";
import { getHqSession, hasScope } from "@/components/shell/hq-session";
import { AccessDeniedState } from "@/lib/access-state";
import { chooseClubAction, createClubAction } from "./actions";

export const metadata: Metadata = { title: "Set up your club" };
export const dynamic = "force-dynamic";

const errors: Readonly<Record<string, string>> = {
  terms: "Accept the Duna HQ Terms and Privacy Policy to create your club.",
  volleyballType: "Choose beach, indoor or both.",
  plan: "Choose one of the plans.",
  name: "Write your club's name, at least two characters.",
  website:
    "That website address doesn't look right. Leave it empty, or write it like yourclub.com.",
  workspace: "That club isn't available to this account.",
};

const publicWebUrl =
  process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

const paths = new Set<FirstRunPath>([
  "website",
  "describe",
  "hand",
  "no-website",
]);

/** The club-creation half: a signed-in person with no club yet, or "Create new organisation". */
async function CreateClub({
  query,
}: {
  readonly query: Record<string, string | undefined>;
}) {
  const createOnly = query.mode === "create";
  const auth = await withAuth();
  const memberships = auth.user
    ? await getWorkOS().userManagement.listOrganizationMemberships({
        userId: auth.user.id,
      })
    : undefined;
  const clubs = memberships
    ? await Promise.all(
        memberships.data.map((membership) =>
          getWorkOS().organizations.getOrganization(membership.organizationId),
        ),
      )
    : [];
  const plans = HQ_PLAN_OPTIONS.map((option) => {
    const definition = ORGANIZATION_PLANS[option.id];
    return {
      id: option.id,
      name: definition.productName,
      tagline: definition.tagline,
      monthly: formatMoney(definition.monthlyPriceMinor, "USD"),
      annualPerMonth: formatMoney(
        Math.round(definition.annualPriceMinor / 12),
        "USD",
      ),
      annualTotal: formatMoney(definition.annualPriceMinor, "USD"),
      feePercent: `${definition.defaultCommissionBps / 100}%`,
      free: definition.monthlyPriceMinor === 0,
    };
  });
  const planIds = new Set(plans.map((plan) => plan.id));
  return (
    <div className="setup-first">
      <header className="setup-first__head">
        <h1 className="td-display setup-first__title">
          {createOnly ? "Create a new club" : "Start your Duna workspace."}
        </h1>
        <p className="setup-first__lead">
          {createOnly
            ? "A separate club keeps its own members, money and settings."
            : "Name your club. If it has a website, Duna reads it next and proposes the rest."}
        </p>
      </header>
      {!createOnly && clubs.length > 0 ? (
        <section aria-labelledby="your-clubs" className="setup-clubs">
          <h2 className="setup-clubs__title" id="your-clubs">
            Your clubs
          </h2>
          <ul>
            {clubs.map((club) => (
              <li key={club.id}>
                <form action={chooseClubAction}>
                  <input name="organizationId" type="hidden" value={club.id} />
                  <Button type="submit" variant="secondary">
                    Open {club.name}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <CreateClubForm
        action={createClubAction}
        error={query.error ? errors[query.error] : undefined}
        initialInterval={query.interval === "year" ? "year" : "month"}
        initialPlan={
          planIds.has(query.plan as HqPlan) ? String(query.plan) : "coach"
        }
        plans={plans}
        privacyUrl={`${publicWebUrl}/legal/privacy`}
        termsUrl={`${publicWebUrl}/legal/hq-terms`}
        termsVersion={HQ_TERMS_VERSION}
      />
    </div>
  );
}

/**
 * Club setup › first run (CS-Start, R2 `/setup/start`). A person with no
 * club creates one here; a club's first visit asks one question, "Do you
 * have a website?", and Duna reads it or the person fills it in by hand.
 * Leaving and returning continues the same read.
 */
export default async function FirstRunPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const session = await getHqSession();
  const configured = isWorkOSAuthKitConfigured();

  if (query.mode === "create" || session.access !== "operator") {
    if (!configured) {
      return (
        <div className="setup-first">
          <header className="setup-first__head">
            <h1 className="td-display setup-first__title">
              Start your Duna workspace.
            </h1>
          </header>
          <NotConfigured
            feature="Creating a club"
            needs="Duna sign-in"
            owner="Duna support"
          />
        </div>
      );
    }
    if (session.access === "none") {
      return (
        <div className="setup-first">
          <header className="setup-first__head">
            <h1 className="td-display setup-first__title">
              Start your Duna workspace.
            </h1>
            <p className="setup-first__lead">
              Sign in first, then name your club.
            </p>
          </header>
          <Button href="/sign-in?returnTo=/setup/start" variant="primary">
            Sign in
          </Button>
        </div>
      );
    }
    return <CreateClub query={query} />;
  }

  const clubName = session.organization?.name ?? "your club";
  if (!hasScope(session, SETUP_SCOPE)) {
    return (
      <div className="setup-first">
        <header className="setup-first__head">
          <h1 className="td-display setup-first__title">Set up {clubName}</h1>
        </header>
        <AccessDeniedState
          area="Club setup"
          grantedBy={`an owner or manager of ${clubName}`}
        />
      </div>
    );
  }

  const [reader, describe, latest, profile] = await Promise.all([
    websiteReaderStatus(),
    describeStatus(),
    loadLatestRun(),
    loadProfile(),
  ]);
  const data = profile.state === "ok" ? profile.data : undefined;
  const requested = query.path as FirstRunPath | undefined;
  const autoStart = query.website
    ? normaliseWebsiteInput(query.website)
    : undefined;
  return (
    <div className="setup-first">
      <header className="setup-first__head">
        <h1 className="td-display setup-first__title">
          Let&apos;s set up {clubName}
        </h1>
        <p className="setup-first__lead">
          Duna can do most of this for you. You check everything before it goes
          in.
        </p>
      </header>
      <FirstRunFlow
        autoStartUrl={autoStart}
        clubName={clubName}
        defaultWebsite={data?.websiteUrl ?? query.website ?? ""}
        describe={describe}
        handInitial={{
          name: data?.name ?? clubName,
          sports: [...(data?.sports ?? [])],
          tagline: data?.tagline ?? "",
          about: data?.about ?? "",
          phone: data?.phoneE164 ?? "",
          email: data?.email ?? "",
          weekly: [...(data?.hours.weekly ?? [])],
          instagram: data?.socials.instagram ?? "",
          facebook: data?.socials.facebook ?? "",
        }}
        initialPath={requested && paths.has(requested) ? requested : "ask"}
        initialRun={latest.state === "ok" ? latest.data : null}
        reader={reader}
      />
    </div>
  );
}
