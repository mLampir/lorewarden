import type { AiChat } from '../composables/useSettings';

/**
 * A task the app hands to Claude: the Lorewarden connector's get_instructions tool returns the
 * full instructions for it, which are too long for a link.
 */
export interface ClaudeTask {
  task: 'new_adventure' | 'adapt_adventure' | 'finish_adventure' | 'new_monster';
  [value: string]: string | undefined;
}

/** The values of a task without the empty ones, as the message passes them to get_instructions. */
export function taskValues(task: ClaudeTask): string {
  const values = Object.fromEntries(
    Object.entries(task).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  return JSON.stringify(values, null, 2);
}

/** A link that opens a new Claude chat with the message typed in, ready to send. */
export function claudeChatUrl(message: string, app: Exclude<AiChat, 'copy'>): string {
  const base = app === 'claude-desktop' ? 'claude://claude.ai/new' : 'https://claude.ai/new';
  return `${base}?q=${encodeURIComponent(message)}`;
}

/** Opens a new Claude chat with the message: in the desktop app, or on claude.ai in a new tab. */
export function openInClaude(message: string, app: Exclude<AiChat, 'copy'>): void {
  const url = claudeChatUrl(message, app);
  if (app === 'claude-web') window.open(url, '_blank', 'noopener');
  else window.location.assign(url);
}
