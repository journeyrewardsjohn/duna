"use client";

/**
 * Settings sections, part two: family (juniors, guardians and their consent
 * states, a junior's club credits), profile artwork, your data (export and
 * delete) and signing out.
 */
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  Input,
  Notice,
  NumberInput,
  Progress,
  Select,
  Textarea,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { upload } from "@vercel/blob/client";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  addDependentAction,
  cancelAccountDeletionAction,
  createPlayerMediaWorkflowAction,
  requestAccountDeletionAction,
  transferFamilyCreditsAction,
} from "@/app/(next)/(app)/app/settings/actions";
import {
  playerMediaPath,
  validatePlayerMediaInput,
} from "@/lib/player-media-storage";
import type {
  DeletionReadiness,
  FamilyWallet,
  MediaStudio,
  PlayerSettingsData,
} from "../api-types";
import { SettingsSection, settled } from "./sections-a";

// ------------------------------------------------------------- family --

function FundJunior({ wallet }: { readonly wallet: FamilyWallet }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [credits, setCredits] = useState<number | null>(1);
  const move = () => {
    const amount = Math.trunc(credits ?? 0);
    if (amount < 1) return;
    void confirm
      .run({
        tier: "strong",
        title: `Move ${amount} credit${amount === 1 ? "" : "s"} to ${wallet.dependentName}?`,
        description: `From your ${wallet.organizationName} credits to ${wallet.dependentName}’s. Credits stay with ${wallet.organizationName}.`,
        amount: `${amount} ${wallet.organizationName} credit${amount === 1 ? "" : "s"}`,
        recipients: `${wallet.dependentName}’s ${wallet.organizationName} wallet`,
        consequence: "Every move is recorded in both wallets.",
        verb: `Move ${amount} credit${amount === 1 ? "" : "s"}`,
        cancelLabel: "Not now",
        agentConfirm: `Moves ${amount} ${wallet.organizationName} credits to ${wallet.dependentName}`,
        perform: async () =>
          settled(
            await transferFamilyCreditsAction({
              dependentPersonId: wallet.dependentPersonId,
              organizationId: wallet.organizationId,
              credits: amount,
            }),
          ),
        success: `${amount} credit${amount === 1 ? "" : "s"} moved to ${wallet.dependentName}`,
        report: (error) =>
          report(error, { event: "web.settings.family_credits_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  };
  return (
    <li className="pp-team__row">
      <span className="pp-stack">
        <span>
          {wallet.dependentName}{" "}
          <span className="td-meta">· {wallet.organizationName}</span>
        </span>
        <span className="td-meta td-num">
          You {wallet.guardianCredits} · {wallet.dependentName.split(" ")[0]}{" "}
          {wallet.dependentCredits} credits
        </span>
        {wallet.fundingEnabled ? (
          <span className="pp-row-actions">
            <NumberInput
              aria-label={`Credits to move to ${wallet.dependentName}`}
              max={Math.max(1, wallet.guardianCredits)}
              min={1}
              onValueChange={(value) => setCredits(value)}
              value={credits}
            />
            <Button
              disabled={wallet.guardianCredits < 1}
              onClick={move}
              size="sm"
              variant="secondary"
            >
              Move credits
            </Button>
          </span>
        ) : null}
      </span>
      <Chip
        kind="status"
        tone={
          wallet.relationshipStatus === "verified"
            ? "positive"
            : wallet.relationshipStatus === "rejected"
              ? "danger"
              : "warning"
        }
      >
        {wallet.relationshipStatus === "verified"
          ? "Guardian verified"
          : wallet.relationshipStatus === "rejected"
            ? "Review rejected"
            : "Review pending"}
      </Chip>
      {confirm.dialog}
    </li>
  );
}

export function FamilySection({
  settings,
  wallets,
  consentDisclosure,
}: {
  readonly settings: PlayerSettingsData;
  readonly wallets: readonly FamilyWallet[];
  readonly consentDisclosure: string;
}) {
  const router = useRouter();
  const adult = settings.profile.ageBand === "adult";
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    birthDate: "",
    relationship: "Parent",
    emergencyContact: true,
    canApproveSpending: true,
    consent: false,
  });
  const add = useAction(
    async () => {
      if (!form.consent) {
        throw new Error(
          "Confirm that you are this child’s parent or legal guardian.",
        );
      }
      return settled(
        await addDependentAction({
          displayName: form.displayName.trim(),
          birthDate: form.birthDate,
          relationship: form.relationship,
          emergencyContact: form.emergencyContact,
          canApproveSpending: form.canApproveSpending,
          consentConfirmed: true,
        }),
      );
    },
    {
      messages: {
        success: (answer) =>
          `${answer.result.ageBand === "under-13" ? "Child" : "Teen"} profile made, private. Your consent is recorded; Duna still checks the relationship.`,
      },
      onSuccess: () => {
        setAdding(false);
        setForm((current) => ({
          ...current,
          displayName: "",
          birthDate: "",
          consent: false,
        }));
        router.refresh();
      },
      report: (error) =>
        report(error, { event: "web.settings.add_junior_failed" }),
    },
  );
  return (
    <SettingsSection
      id="household"
      lead="A guardian books, pays and is contacted for a junior. Juniors are private by rule."
      title="Family"
    >
      {settings.household.length === 0 ? (
        <p className="td-meta">
          {adult
            ? "No juniors or guardians linked yet."
            : "A parent or guardian links to your account to book and pay for you."}
        </p>
      ) : (
        <ul className="pp-team">
          {settings.household.map((member) => (
            <li className="pp-team__row" key={member.person.id}>
              <span>
                {member.person.displayName}
                <span className="td-meta">
                  {" "}
                  · {member.role === "guardian" ? "Guardian" : "Junior"} ·{" "}
                  {member.relationship}
                  {member.emergencyContact ? " · emergency contact" : ""}
                  {member.canApproveSpending ? " · may approve spending" : ""}
                </span>
              </span>
              <Chip
                kind="status"
                tone={member.verified ? "positive" : "warning"}
              >
                {member.verified ? "Verified" : "Pending review"}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      {wallets.length > 0 ? (
        <>
          <p className="pp-label">Juniors’ club credits</p>
          <ul className="pp-team">
            {wallets.map((wallet) => (
              <FundJunior
                key={`${wallet.dependentPersonId}:${wallet.organizationId}`}
                wallet={wallet}
              />
            ))}
          </ul>
        </>
      ) : null}
      {adult ? (
        adding ? (
          <Card className="pp-stack" variant="flat">
            <p className="pp-label">Add a junior</p>
            <p className="td-meta">
              The profile stays private. Duna checks the relationship before you
              can pay or sign for them.
            </p>
            <div className="pp-fieldrow">
              <Field label="Their name">
                <Input
                  maxLength={80}
                  minLength={2}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      displayName: String(value ?? ""),
                    }))
                  }
                  required
                  value={form.displayName}
                />
              </Field>
              <Field label="Birth date">
                <Input
                  max={new Date().toISOString().slice(0, 10)}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      birthDate: String(value ?? ""),
                    }))
                  }
                  required
                  type="date"
                  value={form.birthDate}
                />
              </Field>
              <Field label="You are their">
                <Select
                  onValueChange={(value) =>
                    value &&
                    setForm((current) => ({ ...current, relationship: value }))
                  }
                  options={[
                    "Parent",
                    "Legal guardian",
                    "Grandparent",
                    "Other guardian",
                  ]}
                  value={form.relationship}
                />
              </Field>
            </div>
            <Checkbox
              checked={form.emergencyContact}
              description="A club may contact you about an urgent health or safety issue."
              label="Emergency contact"
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  emergencyContact: checked === true,
                }))
              }
            />
            <Checkbox
              checked={form.canApproveSpending}
              description="You approve their bookings and purchases from your wallet or card."
              label="May approve spending"
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  canApproveSpending: checked === true,
                }))
              }
            />
            <Checkbox
              checked={form.consent}
              description={consentDisclosure}
              label="I’m their parent or legal guardian, and I agree for them"
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  consent: checked === true,
                }))
              }
            />
            <div className="pp-row-actions">
              <Button
                loading={add.showPending}
                onClick={() => void add.run()}
                variant="primary"
              >
                Make a private profile
              </Button>
              <Button onClick={() => setAdding(false)} variant="ghost">
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button
              onClick={() => setAdding(true)}
              size="sm"
              variant="secondary"
            >
              Add a junior
            </Button>
          </div>
        )
      ) : null}
    </SettingsSection>
  );
}

// ------------------------------------------------------------ artwork --

const SLOTS = 5;

interface Shot {
  readonly url?: string;
  readonly preview?: string;
  readonly progress?: number;
  readonly error?: string;
  readonly width?: number;
  readonly height?: number;
}

const STUDIO_LINE: Readonly<Record<string, string>> = {
  ready: "Request received. It may take 3 to 5 minutes to begin.",
  generating:
    "Making your cutout and poster now. This usually takes 3 to 5 minutes.",
  review:
    "Ready for you to review below. Nothing is public until you approve it.",
  published: "Your approved artwork is on your public profile.",
  rejected: "Changes requested.",
  failed: "This one didn’t work. Try again with other photos.",
};

export function ArtworkSection({ studio }: { readonly studio: MediaStudio }) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>(() =>
    Array.from({ length: SLOTS }, () => ({})),
  );
  const [brief, setBrief] = useState("");
  const [rights, setRights] = useState(false);
  const status = studio.workflow?.status;
  useEffect(() => {
    if (status !== "ready" && status !== "generating") return;
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [status, router]);
  const choose = async (index: number, file: File) => {
    const update = (shot: Shot) =>
      setShots((current) =>
        current.map((value, at) => (at === index ? shot : value)),
      );
    try {
      const media = validatePlayerMediaInput({
        contentType: file.type,
        size: file.size,
      });
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (
        Math.min(size.width, size.height) < 1_080 ||
        size.width * size.height < 2_000_000
      ) {
        throw new Error(
          "Choose an original photo at least 1080 pixels on the short side.",
        );
      }
      const preview = URL.createObjectURL(file);
      update({ preview, progress: 0, ...size });
      const blob = await upload(
        playerMediaPath({
          personId: studio.personId,
          kind: "action",
          extension: media.extension,
        }),
        file,
        {
          access: "public",
          handleUploadUrl: "/api/player-media/upload",
          clientPayload: JSON.stringify({
            personId: studio.personId,
            kind: "action",
            contentType: file.type,
            size: file.size,
            ...size,
          }),
          onUploadProgress: ({ percentage }) =>
            update({ preview, progress: percentage, ...size }),
        },
      );
      update({ url: blob.url, preview, progress: 100, ...size });
    } catch (error) {
      update({
        error:
          error instanceof Error ? error.message : "That photo didn’t upload.",
      });
    }
  };
  const ready = shots.filter((shot) => shot.url && shot.width && shot.height);
  const submit = useAction(
    async () => {
      if (ready.length < 2)
        throw new Error("Add at least two action photos first.");
      if (!rights) throw new Error("Confirm you can use every photo.");
      return settled(
        await createPlayerMediaWorkflowAction({
          referenceImages: ready.map((shot) => ({
            url: shot.url!,
            kind: "action" as const,
            width: shot.width!,
            height: shot.height!,
          })),
          ...(brief.trim() ? { brief: brief.trim() } : {}),
          rightsConfirmed: true,
        }),
      );
    },
    {
      messages: {
        success: "Request sent. Your artwork shows here when it is ready.",
      },
      onSuccess: () => router.refresh(),
      report: (error) =>
        report(error, { event: "web.settings.artwork_failed" }),
    },
  );
  return (
    <SettingsSection
      id="artwork"
      lead="Two to five photos of you playing become a cutout and a poster for your public profile. You approve them before anything is shown."
      title="Profile artwork"
    >
      {studio.workflow ? (
        <Notice
          title={
            status === "published"
              ? "Published"
              : status === "review"
                ? "Ready for review"
                : "In progress"
          }
          tone={
            status === "failed"
              ? "danger"
              : status === "published"
                ? "positive"
                : "info"
          }
        >
          {studio.workflow.failureReason ?? STUDIO_LINE[status ?? ""] ?? ""}
        </Notice>
      ) : null}
      {studio.workflow && studio.workflow.outputImages.length > 0 ? (
        <ul className="pp-shots">
          {studio.workflow.outputImages.map((output) => (
            <li key={output.url}>
              <img
                alt={`${studio.displayName}: ${output.kind}`}
                src={output.url}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="pp-shots">
        {shots.map((shot, index) => (
          <li className="pp-shot" key={index}>
            {shot.preview ? (
              <img alt={`Action photo ${index + 1}`} src={shot.preview} />
            ) : null}
            <label className="pp-shot__pick">
              <span>
                {shot.preview
                  ? "Replace"
                  : `Photo ${index + 1}${index > 1 ? " (optional)" : ""}`}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="td-sr"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void choose(index, file);
                }}
                type="file"
              />
            </label>
            {shot.progress !== undefined && shot.progress < 100 ? (
              <Progress
                aria-label={`Photo ${index + 1} upload`}
                max={100}
                value={shot.progress}
              />
            ) : null}
            {shot.error ? (
              <p className="pp-error" role="alert">
                {shot.error}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <Field label="Anything to know" optional>
        <Textarea
          maxLength={500}
          onChange={(event) => setBrief(event.currentTarget.value)}
          rows={2}
          value={brief}
        />
      </Field>
      <Checkbox
        checked={rights}
        label="I took these photos or have permission to use them"
        onCheckedChange={(checked) => setRights(checked === true)}
      />
      <div className="pp-row-actions">
        <Button
          loading={submit.showPending}
          onClick={() => void submit.run()}
          variant="secondary"
        >
          Make my artwork
        </Button>
      </div>
    </SettingsSection>
  );
}

// --------------------------------------------------------------- data --

const DELETED =
  "Your sign-in, profile, imported health records, videos and their copies, posts, messages, forms and connected accounts.";
const KEPT =
  "Financial, tax, fraud-prevention, safety, dispute, consent and security records the law requires, kept only in restricted, de-identified form for their required period.";

export function DataSection({
  settings,
  readiness,
}: {
  readonly settings: PlayerSettingsData;
  readonly readiness: DeletionReadiness;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reason, setReason] = useState("");
  const [forfeit, setForfeit] = useState(false);
  const active = settings.privacyRequests.find((request) =>
    ["queued", "identity-review", "legal-hold"].includes(request.status),
  );
  const scheduled = active
    ? new Date(Date.parse(active.requestedAt) + 7 * 86_400_000)
    : undefined;
  const credits = readiness.totalOrganizationCredits;
  const blocked =
    readiness.blockingReasons.length > 0 || !readiness.canRequestDeletion;

  const exportData = () =>
    void confirm.run({
      tier: "confirm",
      title: "Download your Duna data?",
      description:
        "A private file with your profile, ratings, registrations, orders, wallet, forms, consents and your own account activity. It downloads to this device only.",
      verb: "Download my data",
      cancelLabel: "Not now",
      agentConfirm: "Downloads this person's Duna data export to this device",
      perform: async () => {
        const response = await fetch("/app/settings/export", {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Your data didn’t download. Try again in a moment.");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `duna-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
        return true;
      },
      success: "Your data is downloading",
      report: (error) => report(error, { event: "web.settings.export_failed" }),
    });

  const deleteAccount = () =>
    void confirm
      .run({
        tier: "strong",
        destructive: true,
        title: "Delete your Duna account?",
        description:
          "Sharing, remote access and public links turn off now. You have seven days to change your mind, then the account is deleted.",
        scope: `Deleted: ${DELETED}`,
        consequence: `Kept by law: ${KEPT}${credits > 0 ? ` Your ${credits} unused club credits are given up.` : ""}`,
        bulk: {
          count: 7,
          noun: "kinds of your data",
          typeToConfirm: "delete my account",
        },
        verb: "Delete my account",
        cancelLabel: "Keep my account",
        agentConfirm:
          "Schedules deletion of this person's Duna account in seven days",
        perform: async () =>
          settled(
            await requestAccountDeletionAction({
              ...(reason.trim() ? { reason: reason.trim() } : {}),
              forfeitOrganizationCredits: forfeit,
            }),
          ),
        success:
          "Deletion is scheduled in seven days. Sharing and public links are off now.",
        report: (error) =>
          report(error, { event: "web.settings.delete_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  const keep = () =>
    void confirm
      .run({
        tier: "confirm",
        title: "Cancel the deletion?",
        description:
          "Your account stays. Sharing and links that were turned off stay off until you turn them on again.",
        verb: "Keep my account",
        cancelLabel: "Not now",
        agentConfirm: "Cancels this person's account deletion request",
        perform: async () => settled(await cancelAccountDeletionAction()),
        success: "Deletion cancelled",
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <SettingsSection id="data" title="Your data">
      <Card className="pp-linkcard" variant="flat">
        <div>
          <p className="pp-label">Download your data</p>
          <p className="td-meta">
            Everything Duna holds about you, as a file you keep.
          </p>
        </div>
        <Button onClick={exportData} size="sm" variant="secondary">
          Download my data
        </Button>
      </Card>
      {active ? (
        <Notice
          title={
            active.status === "legal-hold"
              ? "Deletion on hold"
              : "Deletion scheduled"
          }
          tone="warning"
        >
          {active.status === "queued" && scheduled
            ? `Your account is deleted on ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(scheduled)}.`
            : "Something must be settled first; Duna contacts you about it."}{" "}
          Sharing and public links are already off.
          {active.status !== "legal-hold" ? (
            <div className="pp-row-actions">
              <Button onClick={keep} size="sm" variant="secondary">
                Keep my account
              </Button>
            </div>
          ) : null}
        </Notice>
      ) : (
        <Card className="pp-stack" variant="flat">
          <p className="pp-label">Delete your account</p>
          <p className="td-meta">Deleted: {DELETED}</p>
          <p className="td-meta">Kept by law: {KEPT}</p>
          {readiness.blockingReasons.length > 0 ? (
            <Notice role="status" title="Settle these first" tone="warning">
              <ul className="pp-benefits">
                {readiness.blockingReasons.includes("cash-balance") ? (
                  <li>
                    Withdraw your available{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: readiness.cash.currency,
                    }).format(readiness.cash.availableMinor / 100)}
                    . Duna never takes money you can withdraw.
                  </li>
                ) : null}
                {readiness.blockingReasons.includes("pending-cash") ? (
                  <li>Wait for pending wallet activity to settle.</li>
                ) : null}
                {readiness.blockingReasons.includes("active-subscription") ? (
                  <li>
                    Cancel your memberships first; paid time runs to its end
                    date.
                  </li>
                ) : null}
                {readiness.blockingReasons.includes("owned-organization") ? (
                  <li>
                    Hand over or close{" "}
                    {readiness.ownedOrganizations
                      .map((organization) => organization.organizationName)
                      .join(", ")}
                    .
                  </li>
                ) : null}
                {readiness.blockingReasons.includes(
                  "account-data-unavailable",
                ) ? (
                  <li>
                    Balance checks aren’t available just now. Try again later.
                  </li>
                ) : null}
              </ul>
            </Notice>
          ) : null}
          {credits > 0 ? (
            <Checkbox
              checked={forfeit}
              description={readiness.organizationCredits
                .map(
                  (wallet) => `${wallet.organizationName}: ${wallet.credits}`,
                )
                .join(" · ")}
              label={`I give up my ${credits} unused club credits`}
              onCheckedChange={(checked) => setForfeit(checked === true)}
            />
          ) : null}
          <Field label="Anything we should know" optional>
            <Textarea
              maxLength={1000}
              onChange={(event) => setReason(event.currentTarget.value)}
              rows={2}
              value={reason}
            />
          </Field>
          <div className="pp-row-actions">
            <Button
              disabled={blocked || (credits > 0 && !forfeit)}
              onClick={deleteAccount}
              size="sm"
              variant="danger"
            >
              Delete my account
            </Button>
          </div>
        </Card>
      )}
      {confirm.dialog}
    </SettingsSection>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  const confirm = useConfirm();
  return (
    <div>
      <Button
        onClick={() =>
          void confirm.run({
            tier: "confirm",
            title: "Sign out of Duna?",
            description:
              "You'll need to sign in again to see your bookings, messages and wallet on this device.",
            verb: "Sign out now",
            cancelLabel: "Stay signed in",
            agentConfirm: "Signs this person out of Duna on this device",
            perform: () =>
              signOut({
                returnTo: new URL("/", window.location.origin).toString(),
              }),
            errorMessage: "Duna couldn't sign you out. Try again.",
            report: (error) =>
              report(error, { event: "web.settings.sign_out_failed" }),
          })
        }
        variant="secondary"
      >
        Sign out
      </Button>
      {confirm.dialog}
    </div>
  );
}

export function SignOutSection({
  authConfigured,
}: {
  readonly authConfigured: boolean;
}) {
  return (
    <SettingsSection id="sign-out" title="Sign out">
      <p className="td-meta">
        Signing out ends your session on this device. Your plans and results
        stay in your account.
      </p>
      {authConfigured ? (
        <SignOutButton />
      ) : (
        <p className="td-meta">
          This preview has no sign-in, so there is nothing to sign out of.
        </p>
      )}
    </SettingsSection>
  );
}
