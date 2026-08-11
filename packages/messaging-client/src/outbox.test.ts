import { describe, expect, it } from "vitest";
import { MemoryOutboxStorage, MessagingOutbox } from "./outbox";

describe("MessagingOutbox", () => {
  it("deduplicates retries by client message id and removes acknowledgements", async () => {
    const outbox = new MessagingOutbox(new MemoryOutboxStorage());
    const input = {
      conversationId: "61d68766-68fc-4d07-b473-986acbed21d1",
      clientMessageId: "73c29c09-2372-41f1-af55-e4283053b616",
      kind: "text" as const,
      body: "Court 2 is ready.",
      widgets: [],
      attachmentUploadIds: [],
    };
    await outbox.enqueue(input);
    await outbox.enqueue(input);
    expect(await outbox.pending()).toHaveLength(1);
    await outbox.markSending(input.clientMessageId);
    expect((await outbox.pending())[0]).toMatchObject({
      status: "sending",
      attempts: 1,
    });
    await outbox.acknowledge(input.clientMessageId);
    expect(await outbox.pending()).toEqual([]);
  });
});
