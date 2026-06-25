// Normalized Levenshtein edit distance — the cheap, dependency-free signal
// behind the learning loop. It answers "how much did the maintainer change the
// AI's draft before shipping it?": 0 = shipped verbatim, 1 = rewritten from
// scratch. The trend of this number over time is the single clearest measure of
// whether Helmsman is learning a repo's voice (it should fall).

/** Raw Levenshtein distance between two strings (iterative two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Edit ratio in [0,1]: distance normalized by the longer string's length.
 * Guards against runaway cost on very large drafts by capping the compared
 * length (the ratio stays meaningful and the DP stays O(n·m) bounded).
 */
export function editRatio(ai: string, final: string, cap = 8000): number {
  const a = (ai ?? "").slice(0, cap);
  const b = (final ?? "").slice(0, cap);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return Math.min(1, levenshtein(a, b) / longest);
}
