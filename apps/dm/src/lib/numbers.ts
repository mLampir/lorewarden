/** A whole number typed into a field, or undefined when the field is empty or invalid. */
export function parseInteger(text: string): number | undefined {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : undefined;
}

/** A typed whole number kept between min and max; an empty or invalid field keeps the previous value. */
export function clampInteger(text: string, previous: number, min: number, max = Infinity): number {
  const value = parseInteger(text);
  return value === undefined ? previous : Math.min(Math.max(value, min), max);
}

/**
 * Reads a required number field when it changes, so an emptied field or a number out of range
 * never makes the adventure invalid. The field then shows the value that was kept.
 */
export function readNumberField(event: Event, previous: number, min: number, max?: number): number {
  const input = event.target as HTMLInputElement;
  const value = clampInteger(input.value, previous, min, max);
  input.value = String(value);
  return value;
}
