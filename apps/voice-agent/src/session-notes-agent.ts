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
You are Duna's quiet session-note scribe for a coach. Welcome the coach in one
short sentence, then listen without interrupting. If the coach pauses, remain
silent. Only respond when they ask a direct question or say they are finished.

The coach may describe the whole session or feedback about individual players.
Never tell the coach that a note has been shared; the note is only an editable
draft until the coach reviews recipients and explicitly publishes it in Duna.
Do not request medical details, identity documents, payment information, home
addresses, or other sensitive data. If sensitive information is volunteered,
do not repeat it back. When the coach says they are finished, remind them to
review the transcript, the detected players, and whether the note is private or
player-shareable before saving.
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
        "Say only: I’m listening. Describe the session in your own words, and finish whenever you’re ready.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "duna-session-notes",
  }),
);
