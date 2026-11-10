export function removeFirstAndLastBrackets(text: string): string {
  const result = text.slice(1, text.length - 1).trim();

  return result;
}
