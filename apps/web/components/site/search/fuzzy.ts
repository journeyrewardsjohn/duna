/**
 * Typo-tolerant matching for Duna's own clubs and courts in the Where picker
 * (spec 2.3): a word of 4 to 6 letters may be one edit away, a longer word
 * two, so "manhatan" still finds Manhattan Beach. Places brings its own
 * spelling tolerance; this covers what Duna lists. Pure, tested directly.
 */

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, stopping early once it passes `limit`. */
export function editDistance(left: string, right: string, limit = 3): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let best = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + cost,
      );
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length]!;
}

/** How many edits a word of this length may be away. */
export function allowedEdits(word: string): number {
  if (word.length >= 7) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

function wordMatches(queryWord: string, textWord: string): boolean {
  if (textWord.startsWith(queryWord)) return true;
  const edits = allowedEdits(queryWord);
  if (edits === 0) return false;
  // Compare against the whole word and against its start, so a word being
  // typed ("manhat") still matches.
  const length = queryWord.length;
  const candidates = [
    textWord,
    textWord.slice(0, length - 1),
    textWord.slice(0, length),
    textWord.slice(0, length + 1),
  ];
  return candidates.some(
    (candidate) => editDistance(queryWord, candidate, edits) <= edits,
  );
}

/**
 * A relevance score for `text` against what was typed, or -1 for no match.
 * Exact start beats a word start beats contains beats a typo match.
 */
export function fuzzyScore(query: string, text: string): number {
  const typed = normalizeText(query);
  const target = normalizeText(text);
  if (!typed) return -1;
  if (target.startsWith(typed)) return 100;
  if (target.includes(` ${typed}`)) return 90;
  if (target.includes(typed)) return 80;
  const words = target.split(" ");
  const typedWords = typed.split(" ");
  const matched = typedWords.every((word) =>
    words.some((candidate) => wordMatches(word, candidate)),
  );
  return matched ? 60 : -1;
}
