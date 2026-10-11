/**
 * Pulls the JSON out of a pasted AI answer: the first ```json code block if there is one,
 * otherwise everything from the first "{" to the last "}".
 */
export function extractJson(text: string): string {
  const block = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
  if (block?.[1]) return block[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim();
}
