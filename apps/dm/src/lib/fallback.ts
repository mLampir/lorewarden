/**
 * Puts a fallback into a required text field the user left empty,
 * so the adventure always stays valid and can be saved and exported.
 */
export function fillIfBlank<T extends object, K extends keyof T & string>(
  target: T,
  key: K,
  fallback: string,
) {
  const value = target[key];
  if (typeof value === 'string' && value.trim() === '') {
    (target as Record<K, unknown>)[key] = fallback;
  }
}
