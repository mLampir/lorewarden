import type { IntegrityProblem } from '@lorewarden/core';
import { ref } from 'vue';
import { extractJson } from '../lib/extract-json';

/** What reading a pasted answer gives: the value, or what is wrong with it. */
export type AiAnswer<T> = { ok: true; value: T } | { ok: false; problems: IntegrityProblem[] };

/** Copies text to the clipboard; false when the browser blocks it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The copy-and-paste way to an AI that has no Lorewarden connector: copy the instructions, paste
 * them into the AI, and import the answer it gives. Shows the instructions for manual copying
 * when the clipboard is blocked, and lists what is wrong with an answer that does not fit.
 */
export function useAiExchange() {
  /** The instructions last copied, shown to copy by hand when the clipboard is blocked. */
  const prompt = ref('');
  const copied = ref(false);
  const answer = ref('');
  const problems = ref<IntegrityProblem[]>([]);

  async function copyPrompt(text: string) {
    prompt.value = text;
    copied.value = await copyText(text);
  }

  /**
   * Reads the pasted answer and hands what it holds to take. The answer is cleared unless take
   * returns false, e.g. when the game master cancels or saving fails.
   */
  async function importAnswer<T>(
    parse: (json: string) => AiAnswer<T>,
    take: (value: T) => boolean | undefined | Promise<boolean | undefined>,
  ) {
    const result = parse(extractJson(answer.value));
    if (!result.ok) {
      problems.value = result.problems;
      return;
    }
    problems.value = [];
    if ((await take(result.value)) !== false) answer.value = '';
  }

  /** Copies the import errors so they can be pasted back to the AI for a fixed answer. */
  async function copyProblems() {
    const lines = problems.value.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
    // When the clipboard is blocked, the errors stay visible for manual copying.
    await copyText(lines.join('\n'));
  }

  return { prompt, copied, answer, problems, copyPrompt, importAnswer, copyProblems };
}
