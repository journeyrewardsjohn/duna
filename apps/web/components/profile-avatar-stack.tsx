import styles from "./profile-avatar-stack.module.css";

export interface ProfileAvatarPerson {
  readonly displayName: string;
  readonly initials: string;
  readonly avatarUrl?: string;
}

type ProfileAvatarSize = "xs" | "sm" | "md" | "lg";

function classes(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export function ProfileAvatar({
  className,
  person,
  size = "sm",
}: {
  readonly className?: string;
  readonly person: ProfileAvatarPerson;
  readonly size?: ProfileAvatarSize;
}) {
  return (
    <span
      aria-hidden="true"
      className={classes(styles.avatar, styles[size], className)}
      title={person.displayName}
    >
      {person.avatarUrl ? (
        <img alt="" loading="lazy" src={person.avatarUrl} />
      ) : (
        <span>{person.initials}</span>
      )}
    </span>
  );
}

export function ProfileAvatarStack({
  className,
  label,
  max = 4,
  people,
  size = "sm",
}: {
  readonly className?: string;
  readonly label?: string;
  readonly max?: number;
  readonly people: readonly ProfileAvatarPerson[];
  readonly size?: ProfileAvatarSize;
}) {
  if (people.length === 0) return null;

  const visible = people.slice(0, max);
  const hiddenCount = people.length - visible.length;
  const accessibleLabel =
    label ??
    `${people.length} ${people.length === 1 ? "person" : "people"}: ${people
      .map((person) => person.displayName)
      .join(", ")}`;

  return (
    <span
      aria-label={accessibleLabel}
      className={classes(styles.stack, className)}
      role="img"
    >
      {visible.map((person, index) => (
        <ProfileAvatar
          key={`${person.displayName}-${index}`}
          person={person}
          size={size}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          aria-hidden="true"
          className={classes(styles.avatar, styles[size], styles.remainder)}
        >
          +{hiddenCount}
        </span>
      )}
    </span>
  );
}
