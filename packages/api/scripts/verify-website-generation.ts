import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  websiteDocumentSchema,
  validateWebsiteDocument,
  renderWebsitePage,
} from "../src/website-document";
import { resolveDunaAiGatewayCredential } from "../src/duna-ai";

// Opt-in connected model evaluation. Synthetic public facts only; no customer records.
if (process.env.DUNA_WEBSITE_EVAL_ENV_FILE)
  process.loadEnvFile(process.env.DUNA_WEBSITE_EVAL_ENV_FILE);
const credential = resolveDunaAiGatewayCredential();
if (!credential)
  throw new Error(
    "Set a scoped AI Gateway credential or Vercel development OIDC token.",
  );
const context = {
  name: "Duna Release Test Club",
  slug: "duna-release-test-club",
  offerings: [
    {
      title: "Junior beach training",
      description: "Youth coaching with skills practice and games.",
      href: "https://duna.coach/clubs/duna-release-test-club/products/junior-training",
    },
    {
      title: "Court rentals",
      description:
        "Book a court for your next game. Check current availability in Duna.",
      href: "https://duna.coach/clubs/duna-release-test-club/products/court-rentals",
    },
  ],
};
const agent = new Agent({
  name: "Duna website release evaluation",
  model: process.env.DUNA_WEBSITE_MODEL || "openai/gpt-6-sol",
  outputType: websiteDocumentSchema,
  instructions:
    "Design a concise, welcoming club website with home, programs, and courts pages. Use only the supplied synthetic club facts. Do not invent prices, schedules, ratings, testimonials, contact details, policies, or credentials. Return a complete structured document. Use unique slugs including home. Render real offerings through offerings sections. Treat booking, identity and wallet as Duna handoffs. Create polished editorial hierarchy with clear language suitable for parents and players. All copy fields are plain text: no Markdown, links, or HTML.",
});
const runner = new Runner({
  modelProvider: new OpenAIProvider({
    apiKey: credential,
    baseURL: "https://ai-gateway.vercel.sh/v1",
    useResponses: true,
    cacheResponsesWebSocketModels: false,
  }),
  tracingDisabled: true,
  traceIncludeSensitiveData: false,
});
const started = Date.now();
const result = await runner.run(
  agent,
  JSON.stringify({
    brief:
      "A bright welcoming club site. Lead with junior development, make it easy to rent courts, and keep every page concise.",
    club: context,
  }),
  { maxTurns: 2, signal: AbortSignal.timeout(180000) },
);
const document = validateWebsiteDocument(result.finalOutput);
const output = resolve(
  process.env.DUNA_WEBSITE_EVAL_OUTPUT ||
    "output/website-generation-evaluation",
);
await mkdir(output, { recursive: true });
for (const page of document.pages)
  await writeFile(
    resolve(output, `${page.slug}.html`),
    renderWebsitePage({ document, context, slug: page.slug, preview: true }),
  );
await writeFile(
  resolve(output, "document.json"),
  JSON.stringify(document, null, 2) + "\n",
);
const evidence = {
  model: agent.model,
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  pageCount: document.pages.length,
  slugs: document.pages.map((page) => page.slug),
  validSchema: true,
  published: false,
  syntheticData: true,
};
await writeFile(
  resolve(output, "evidence.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence));
