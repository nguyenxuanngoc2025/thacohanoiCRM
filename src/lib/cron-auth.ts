export function checkCronSecret(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected) return false;
  return header === expected;
}
