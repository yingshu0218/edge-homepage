export function normalizeDestination(input: string, searchTemplate: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return new URL(value).toString();
  if (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(value)) return new URL(`https://${value}`).toString();
  return searchTemplate.replace('%s', encodeURIComponent(value));
}
