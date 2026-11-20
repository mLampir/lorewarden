// What the app keeps in this browser: settings, the interface language, the chosen role. Storage
// can be blocked, e.g. in a private window; values then last until the page is reloaded.

/** Reads a value this browser keeps, or null when there is none or storage is blocked. */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keeps a value in this browser; null removes it. */
export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the value lasts until the page is reloaded.
  }
}
