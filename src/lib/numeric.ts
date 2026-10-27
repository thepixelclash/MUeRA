/** Empty is a valid editing draft, never a forced zero. */
export function numericDraft(value: string): string | null {
  if (!/^\d*$/.test(value) || (value !== "" && !Number.isSafeInteger(Number(value)))) return null;
  return value.replace(/^0+(?=\d)/, "");
}
