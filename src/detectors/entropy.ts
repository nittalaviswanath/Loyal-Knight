/**
 * Shannon Entropy calculation and token extraction for SecretSentry.
 * Operates purely on strings with zero external or VS Code dependencies.
 */

export interface CandidateToken {
  value: string;
  startColumn: number;
  endColumn: number;
  quote?: string;
  context: string;
}

/**
 * Calculates the Shannon entropy of a string in bits per character.
 * Range: 0 to log2(alphabet size).
 * English text is typically 2.5 - 3.5.
 * High-entropy random strings/keys are typically 4.0 - 5.5+.
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  const length = str.length;
  let entropy = 0;

  for (const count of frequencies.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return Math.round(entropy * 1000) / 1000;
}

/**
 * Tests whether a candidate string exceeds the Shannon entropy threshold.
 */
export function isHighEntropy(str: string, threshold = 4.2): boolean {
  return calculateShannonEntropy(str) >= threshold;
}

const COMMON_PLACEHOLDER_REGEX = /^(?:your[_-]api[_-]key|your[_-]secret|your[_-]token|your[_-]key|placeholder|changeme|replace[_-]me|enter[_-]your|dummy[_-]key|sample[_-]token|fake[_-]key|xxxx+|0000+|1111+|12345678|todo|fixme)/i;
const CONTAINS_PLACEHOLDER_SUBSTRING = /(?:your_api_key|your-api-key|example_key|changeme|replace_me|enter_here|insert_key|dummy_secret)/i;

/**
 * Detects whether a string is an obvious placeholder, mock, or synthetic pattern.
 */
export function isObviousPlaceholder(val: string): boolean {
  if (!val || val.length === 0) {
    return true;
  }

  const trimmed = val.trim();
  if (trimmed.length === 0) {
    return true;
  }

  // Common placeholder prefixes/patterns
  if (COMMON_PLACEHOLDER_REGEX.test(trimmed) || CONTAINS_PLACEHOLDER_SUBSTRING.test(trimmed)) {
    return true;
  }

  // Check for AWS example key specifically mentioned in docs
  if (trimmed === 'AKIAIOSFODNN7EXAMPLE') {
    return true;
  }

  // Low diversity check: e.g. "AAAAAAAAAAAAAAAAAAAA" or "0101010101010101"
  if (trimmed.length >= 12) {
    const uniqueChars = new Set(trimmed).size;
    if (uniqueChars <= 3) {
      return true;
    }
    // Repetitive ratio check
    if (uniqueChars / trimmed.length < 0.15) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts string literals and assignment tokens from a single line of code/text.
 */
export function extractCandidateTokens(line: string, minLength = 16): CandidateToken[] {
  const candidates: CandidateToken[] = [];

  // Match quoted strings: "...", '...', or `...`
  const quotedRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let match: RegExpExecArray | null;

  while ((match = quotedRegex.exec(line)) !== null) {
    const quoteChar = match[1];
    const content = match[2];
    const startOffset = match.index + 1; // skip quote character
    const endOffset = startOffset + content.length;

    if (content.length >= minLength) {
      candidates.push({
        value: content,
        startColumn: startOffset,
        endColumn: endOffset,
        quote: quoteChar,
        context: extractLineContext(line, match.index),
      });
    }
  }

  // Match environment variable or config assignments without quotes (e.g. API_KEY=abcdef1234567890...)
  const envRegex = /(?:^|\s)([A-Z0-9_]{3,})\s*=\s*([a-zA-Z0-9_\-./+=]{16,})(?:\s|$)/g;
  while ((match = envRegex.exec(line)) !== null) {
    const varName = match[1];
    const value = match[2];
    const fullMatch = match[0];
    const valueIndex = match.index + fullMatch.lastIndexOf(value);

    // Only add if not already captured by quoted scanner
    const alreadyCaptured = candidates.some(
      (c) => c.startColumn <= valueIndex && c.endColumn >= valueIndex + value.length
    );

    if (!alreadyCaptured && value.length >= minLength) {
      candidates.push({
        value,
        startColumn: valueIndex,
        endColumn: valueIndex + value.length,
        context: `environment variable '${varName}'`,
      });
    }
  }

  return candidates;
}

/**
 * Extracts contextual clue before the token on the same line (e.g. variable name).
 */
export function extractLineContext(line: string, matchIndex: number): string {
  const prefix = line.slice(0, matchIndex).trim();

  // Pattern: const/let/var AWS_KEY: string = ...
  const varMatch = /(?:const|let|var|val)\s+([a-zA-Z0-9_$]+)(?:\s*:[^=]+)?\s*=?\s*$/i.exec(prefix);
  if (varMatch) {
    return `assigned to const/var ${varMatch[1]}`;
  }

  // Pattern: object property: apiKey: ... or "apiKey": ...
  const propMatch = /["']?([a-zA-Z0-9_$-]+)["']?\s*:\s*$/i.exec(prefix);
  if (propMatch) {
    return `property '${propMatch[1]}'`;
  }

  // Pattern: KEY=...
  const assignMatch = /([a-zA-Z0-9_$-]+)\s*=\s*$/i.exec(prefix);
  if (assignMatch) {
    return `assigned to ${assignMatch[1]}`;
  }

  if (prefix.length > 0) {
    return prefix.slice(-30).trim();
  }

  return 'inline literal';
}
