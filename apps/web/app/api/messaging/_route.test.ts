import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  fromRequest: vi.fn(),
  fromSession: vi.fn(),
  withAuth: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: mocks.withAuth,
}));

vi.mock("@duna/api", () => ({
  activeOrganizationIdFromCookie: vi.fn(),
  createApiContextFromRequest: mocks.fromRequest,
  createApiContextFromWorkOSSession: mocks.fromSession,
  isWorkOSAuthKitConfigured: mocks.configured,
  MessagingError: class MessagingError extends Error {},
}));

import { messagingActorFromRequest } from "./_route";

const actor = {
  personId: "10000000-0000-4000-8000-000000000001",
  displayName: "Player",
  roles: ["player"],
  scopes: [],
  ageBand: "adult",
  isDemo: false,
};

describe("messaging request authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
  });

  it("uses access-token authentication for native bearer requests", async () => {
    mocks.fromRequest.mockResolvedValue({ actor });

    await expect(
      messagingActorFromRequest(
        new Request("https://duna.coach/api/messaging/inbox", {
          headers: { authorization: "Bearer native-access-token" },
        }),
      ),
    ).resolves.toEqual(actor);

    expect(mocks.fromRequest).toHaveBeenCalledOnce();
    expect(mocks.withAuth).not.toHaveBeenCalled();
    expect(mocks.fromSession).not.toHaveBeenCalled();
  });

  it("uses the browser session when no bearer token is present", async () => {
    mocks.withAuth.mockResolvedValue({
      user: { id: "workos-user" },
      organizationId: null,
      role: null,
      roles: [],
    });
    mocks.fromSession.mockResolvedValue({ actor });

    await expect(
      messagingActorFromRequest(
        new Request("https://duna.coach/api/messaging/inbox"),
      ),
    ).resolves.toEqual(actor);

    expect(mocks.withAuth).toHaveBeenCalledOnce();
    expect(mocks.fromSession).toHaveBeenCalledOnce();
    expect(mocks.fromRequest).not.toHaveBeenCalled();
  });
});
