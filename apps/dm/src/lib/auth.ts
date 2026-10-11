import { ref } from 'vue';

// Signing in to a Lorewarden server that others can reach. On the computer Lorewarden runs on,
// no password is needed until one is chosen.

export const MIN_PASSWORD_LENGTH = 12;

export interface AuthStatus {
  /** Whether this browser may use the app. */
  access: boolean;
  /** Where the password comes from, if there is one. */
  password: 'none' | 'settings' | 'environment';
  /** Whether this browser runs on the computer Lorewarden runs on. */
  local: boolean;
}

/** Undefined until the server has answered. */
export const authStatus = ref<AuthStatus>();

export type AuthError = 'wrong' | 'tooMany' | 'tooShort' | 'failed';

/** What is wrong with a new password typed twice, if anything. */
export function newPasswordMistake(
  password: string,
  repeated: string,
): 'tooShort' | 'mismatch' | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (password !== repeated) return 'mismatch';
  return undefined;
}

export async function loadAuthStatus(): Promise<AuthStatus | undefined> {
  try {
    const response = await fetch('/api/auth/status', { cache: 'no-store' });
    if (response.ok) authStatus.value = (await response.json()) as AuthStatus;
  } catch {
    // The server is not running; the app says so.
  }
  return authStatus.value;
}

async function post(path: string, body: unknown): Promise<AuthError | undefined> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return 'failed';
  }
  if (response.ok) {
    await loadAuthStatus();
    return undefined;
  }
  if (response.status === 429) return 'tooMany';
  if (response.status === 400) return 'tooShort';
  if (response.status === 403) return 'wrong';
  return 'failed';
}

export function signIn(password: string): Promise<AuthError | undefined> {
  return post('login', { password });
}

/** Chooses the first password; away from the server it needs the token from the setup link. */
export function setUp(password: string, token?: string): Promise<AuthError | undefined> {
  return post('setup', { password, token });
}

export function changePassword(current: string, password: string) {
  return post('password', { current, password });
}

export async function signOut(): Promise<void> {
  await post('logout', {});
}

/** The token from a setup link such as /setup?token=..., which the server prints. */
export function setupToken(): string | undefined {
  if (window.location.pathname !== '/setup') return undefined;
  return new URLSearchParams(window.location.search).get('token') ?? undefined;
}

/** Leaves the setup link, so it is not bookmarked or shared by accident. */
export function leaveSetupLink(): void {
  if (window.location.pathname === '/setup') window.history.replaceState(null, '', '/');
}
