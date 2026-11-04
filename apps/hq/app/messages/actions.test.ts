import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  send: vi.fn(),
  sendPhoneReply: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/api", () => ({
  getServerCaller: async () => ({
    messaging: {
      create: mocks.create,
      send: mocks.send,
      sendPhoneReply: mocks.sendPhoneReply,
    },
  }),
}));

import {
  createOrganizationConversation,
  sendOrganizationMessage,
  type MessagingActionState,
} from "./actions";

const initialState: MessagingActionState = { status: "idle", message: "" };

describe("HQ messaging actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an audience validation error in the composer", async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error("Choose at least one eligible recipient."), {
        code: "BAD_REQUEST",
      }),
    );
    const formData = new FormData();
    formData.set(
      "audience",
      "event::10000000-0000-4000-8000-000000000001::Saturday clinic",
    );
    formData.set("organizationId", "20000000-0000-4000-8000-000000000001");
    formData.set("title", "Saturday clinic update");
    formData.set("message", "Courts open at 8:15 AM.");
    formData.set("clientMessageId", "30000000-0000-4000-8000-000000000001");

    await expect(
      createOrganizationConversation(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Choose at least one eligible recipient.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("only sends to a phone when staff explicitly select a binding", async () => {
    const form = new FormData();
    form.set("conversationId", "40000000-0000-4000-8000-000000000001");
    form.set("clientMessageId", "50000000-0000-4000-8000-000000000001");
    form.set("body", "Your lesson starts at 4 PM.");
    form.set("phoneBindingId", "60000000-0000-4000-8000-000000000001");
    await sendOrganizationMessage(initialState, form);
    expect(mocks.sendPhoneReply).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "60000000-0000-4000-8000-000000000001",
        message: expect.objectContaining({
          body: "Your lesson starts at 4 PM.",
        }),
      }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps a send error inside the active thread", async () => {
    mocks.send.mockRejectedValueOnce(
      Object.assign(new Error("Posting is disabled."), { code: "FORBIDDEN" }),
    );
    const formData = new FormData();
    formData.set("conversationId", "40000000-0000-4000-8000-000000000001");
    formData.set("clientMessageId", "50000000-0000-4000-8000-000000000001");
    formData.set("body", "Updated start time.");

    await expect(
      sendOrganizationMessage(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Posting is disabled.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not expose an unexpected server error to the operator", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.send.mockRejectedValueOnce(new Error("private database detail"));
    const formData = new FormData();
    formData.set("conversationId", "40000000-0000-4000-8000-000000000001");
    formData.set("clientMessageId", "50000000-0000-4000-8000-000000000001");
    formData.set("body", "Updated start time.");

    await expect(
      sendOrganizationMessage(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "The message could not be sent. Try again.",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
