import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { BrandEditor } from "@/components/setup/brand-editor";
import { IdentityProfile } from "@/components/setup/identity-profile";
import { KnowledgeList } from "@/components/setup/knowledge-list";
import { RereadCard } from "@/components/setup/reread-card";
import {
  loadProfile,
  loadWorkspace,
  websiteReaderStatus,
} from "@/components/setup/setup-data";
import { siteName } from "@/components/setup/setup-model";
import { SetupScreen, setupContext } from "@/components/setup/setup-screen";
import { SetupBlockState } from "@/components/setup/setup-states";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Club identity" };

/**
 * Club setup › Identity (S-Club-Identity): the club's profile as settings
 * written as sentences, its brand (mark, colour, card and club page in
 * light and dark), what Duna knows about it, and "Read my website again".
 * Each value says where it came from.
 */
export default async function IdentityPage() {
  const context = await setupContext();
  const [profile, workspace, reader] = await Promise.all([
    loadProfile(),
    loadWorkspace(),
    websiteReaderStatus(),
  ]);
  const website = profile.state === "ok" ? profile.data.websiteUrl : undefined;
  return (
    <SetupScreen
      askLabel="Club identity"
      askStarters={[
        "Write a tagline for our club",
        "Is our club colour readable on buttons?",
        "What did our website say that differs from this?",
      ]}
      description="How your club appears on its page, in the app and on members' cards"
      tab="identity"
      title="Club identity"
    >
      <PageSection id="profile" title="Profile">
        {profile.state === "ok" ? (
          <IdentityProfile profile={profile.data} timeZone={context.timeZone} />
        ) : (
          <SetupBlockState
            loaded={profile}
            organization={context.organization}
            retryHref={hqHref("setupIdentity")}
            what="your club's profile"
          />
        )}
      </PageSection>
      <PageSection
        id="reread"
        title={
          website
            ? `Read ${siteName(website)} again`
            : "Fill this in from your website"
        }
      >
        <p className="setup-section-lead">
          {website
            ? "Duna shows only what changed, next to what you have now. Anything you set yourself stays unless you choose the website's version."
            : "Give Duna your website and it proposes your profile, places, hours and prices for you to keep or skip."}
        </p>
        <RereadCard reader={reader} website={website ?? ""} />
        {reader === "not-configured" ? (
          <p className="setup-quiet">
            Duna&apos;s website reader isn&apos;t set up here yet. Everything
            above can be edited by hand.
          </p>
        ) : null}
      </PageSection>
      <PageSection id="brand" title="Brand">
        {workspace.state === "ok" ? (
          <BrandEditor
            clubName={workspace.data.organization.name}
            organizationId={workspace.data.organization.id}
            theme={workspace.data.theme}
          />
        ) : (
          <SetupBlockState
            loaded={workspace}
            organization={context.organization}
            retryHref={hqHref("setupIdentity")}
            what="your club's brand"
          />
        )}
      </PageSection>
      <PageSection id="knowledge" title="What Duna knows about your club">
        {workspace.state === "ok" ? (
          <KnowledgeList sources={workspace.data.brandKnowledge.sources} />
        ) : (
          <SetupBlockState
            loaded={workspace}
            organization={context.organization}
            what="what Duna knows"
          />
        )}
      </PageSection>
    </SetupScreen>
  );
}
