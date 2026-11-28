/**
 * Page text is untrusted. Before it reaches the model, lines that read like
 * instructions to an AI are removed; afterwards, any fact that quotes or
 * carries such text is dropped (./validate.ts). Neither step can add a fact.
 */

const instructionLike = [
  /\bignore\b.{0,40}\b(?:previous|prior|above|earlier|all)\b.{0,40}\b(?:instructions?|prompts?|rules|messages?)\b/i,
  /\bdisregard\b.{0,40}\b(?:instructions?|prompts?|rules|above)\b/i,
  /\b(?:system|developer)\s*(?:prompt|message|instructions?)\b/i,
  /\byou\s+are\s+(?:now\s+)?(?:an?\s+)?(?:ai|assistant|language model|chatbot|gpt|llm)\b/i,
  /\b(?:as an?|dear)\s+(?:ai|assistant|language model|llm)\b/i,
  /\b(?:new|updated|override)\s+instructions?\b/i,
  /\b(?:respond|reply|answer|output)\s+(?:only\s+)?(?:with|in)\s+(?:json|the following)\b/i,
  /\b(?:add|include|insert|report|output)\b.{0,60}\b(?:to|in)\s+(?:the|your)\s+(?:output|answer|results?|json|extraction)\b/i,
  /<\/?(?:system|assistant|user|instructions?)>/i,
  /\[(?:system|inst)\]/i,
];

const invisible = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

export function isInstructionLike(text: string): boolean {
  const flat = text.replace(invisible, "");
  return instructionLike.some((pattern) => pattern.test(flat));
}

export interface SanitisedPage {
  readonly text: string;
  /** How many lines were removed (logged as a count only). */
  readonly removedLines: number;
}

/** Removes invisible characters, inline images and instruction-like lines. */
export function sanitisePageText(raw: string): SanitisedPage {
  let removedLines = 0;
  const lines = raw
    .replace(invisible, "")
    .replace(/!\[[^\]]*\]\(data:[^)]*\)/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .filter((line) => {
      if (isInstructionLike(line)) {
        removedLines += 1;
        return false;
      }
      return true;
    });
  return {
    text: lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    removedLines,
  };
}
