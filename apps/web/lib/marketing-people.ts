import type { ProfileAvatarPerson } from "@/components/profile-avatar-stack";

const peopleBase = "/media/brand/people";

export const marketingPeople = {
  jordan: {
    displayName: "Jordan Cruz",
    initials: "JC",
    avatarUrl: `${peopleBase}/duna-avatar-jordan-cruz-v1.webp`,
  },
  maya: {
    displayName: "Maya Rivera",
    initials: "MR",
    avatarUrl: `${peopleBase}/duna-avatar-maya-rivera-v1.webp`,
  },
  drew: {
    displayName: "Drew Park",
    initials: "DP",
    avatarUrl: `${peopleBase}/duna-avatar-drew-park-v1.webp`,
  },
  jamie: {
    displayName: "Jamie Stone",
    initials: "JS",
    avatarUrl: `${peopleBase}/duna-avatar-jamie-stone-v1.webp`,
  },
  alex: {
    displayName: "Alex Chen",
    initials: "AC",
    avatarUrl: `${peopleBase}/duna-avatar-alex-chen-v1.webp`,
  },
  mara: {
    displayName: "Mara Lewis",
    initials: "ML",
    avatarUrl: `${peopleBase}/duna-avatar-mara-lewis-v1.webp`,
  },
  theo: {
    displayName: "Theo Park",
    initials: "TP",
    avatarUrl: `${peopleBase}/duna-avatar-theo-park-v1.webp`,
  },
  noa: {
    displayName: "Noa Williams",
    initials: "NW",
    avatarUrl: `${peopleBase}/duna-avatar-noa-williams-v1.webp`,
  },
} as const satisfies Record<string, ProfileAvatarPerson>;

export const marketingPlayerGroup = [
  marketingPeople.maya,
  marketingPeople.jamie,
  marketingPeople.mara,
  marketingPeople.noa,
] as const;

const demoAvatarByPersonId: Readonly<Record<string, string>> = {
  "10000000-0000-4000-8000-000000000010": marketingPeople.mara.avatarUrl,
  "10000000-0000-4000-8000-000000000011": marketingPeople.theo.avatarUrl,
  "10000000-0000-4000-8000-000000000012": marketingPeople.noa.avatarUrl,
};

export function withDemoProfileAvatars<
  Person extends ProfileAvatarPerson & { readonly id?: string },
>(people: readonly Person[]): readonly Person[] {
  return people.map((person) => {
    const demoAvatar = person.id ? demoAvatarByPersonId[person.id] : undefined;
    return person.avatarUrl || !demoAvatar
      ? person
      : { ...person, avatarUrl: demoAvatar };
  });
}
