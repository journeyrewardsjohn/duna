import { serve } from "inngest/next";
import { dunaInngestFunctions, inngest } from "./client";

export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...dunaInngestFunctions],
});
