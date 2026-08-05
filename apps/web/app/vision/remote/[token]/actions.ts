"use server";

import type { VisionSessionSettings } from "@duna/api";
import { getServerCaller } from "@/lib/api";

export async function refreshVisionRemoteAction(token: string) {
  try {
    const caller = await getServerCaller();
    const session = await caller.public.visionRemoteSession({ token });
    return { ok: true as const, session };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The Duna Vision remote is unavailable.",
    };
  }
}

export async function updateVisionRemoteAction(input: {
  readonly token: string;
  readonly expectedVersion: number;
  readonly settings?: VisionSessionSettings;
  readonly status?: "setup" | "ready" | "recording" | "ended";
}) {
  try {
    const caller = await getServerCaller();
    const session = await caller.public.updateVisionRemoteSession(input);
    return { ok: true as const, session };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The remote change could not be saved.",
    };
  }
}
