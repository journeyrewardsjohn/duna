import {
  cli,
  defineAgent,
  type JobContext,
  ServerOptions,
  voice,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { fileURLToPath } from "node:url";

const INSTRUCTIONS = `
You are Duna's friendly playing-history guide. Your only job is to help a
player or parent describe the selected player's volleyball experience.

Ask one short question at a time. Cover:
1. whether the answers are for the speaker or their child,
2. amateur, high-school, collegiate, or professional experience,
3. indoor volleyball experience,
4. approximate years playing,
5. optional height,
6. VolleyballLife history, and BVBInfo only for a professional.

Be warm, concise, and easy to interrupt. Never ask for an identity document,
Social Security number, payment information, medical history, exact birth
date, home address, or other sensitive data. Do not represent yourself as
verifying professional status or identity. At the end, recap the inferred
answers and clearly say the player or parent must review and save them in Duna.
`;

export default defineAgent({
  entry: async (context: JobContext) => {
    await context.connect();
    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: "gpt-realtime",
        voice: "coral",
      }),
    });
    await session.start({
      room: context.room,
      agent: new voice.Agent({ instructions: INSTRUCTIONS }),
    });
    session.generateReply({
      instructions:
        "Welcome the player and ask whether these answers are for them or for their child.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "duna-profile-guide",
  }),
);
