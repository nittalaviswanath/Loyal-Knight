import * as crypto from 'node:crypto';
import { SecretFinding, ScanOptions, FindingConfidence, PatternRule } from './types.js';
import { KNOWN_PATTERNS } from './patterns.js';
import {
  calculateShannonEntropy,
  isObviousPlaceholder,
  extractCandidateTokens,
  extractLineContext,
} from './entropy.js';

const DEFAULT_ENTROPY_THRESHOLD = 4.2;
const DEFAULT_MIN_ENTROPY_LENGTH = 16;

/**
 * Generates a SHA-256 hash of the secret string.
 * Used for storing and comparing against suppressed/ignored matches.
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Masks a secret string for safe display in problems, notifications, or logs.
 * Example: "AKIAIOSFODNN7EXAMPLE" -> "AKIA****************"
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length === 0) {
    return '';
  }

  // Check for common key prefixes
  const knownPrefixes = [
    'AKIA', 'ASIA', 'ABIA', 'ACCA',
    'sk_live_', 'rk_live_', 'pk_live_',
    'ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_',
    'sk-proj-', 'sk-',
    'xoxb-', 'xoxp-', 'xoxa-', 'xoxr-', 'xoxs-',
    'SK', 'AC',
    'SG.',
    'AIza',
  ];

  for (const prefix of knownPrefixes) {
    if (secret.startsWith(prefix)) {
      const remainingLength = secret.length - prefix.length;
      return prefix + '*'.repeat(Math.max(remainingLength, 4));
    }
  }

  // Handle generic secrets
  if (secret.length <= 4) {
    return '*'.repeat(secret.length);
  }

  if (secret.length <= 8) {
    return secret.slice(0, 2) + '*'.repeat(secret.length - 2);
  }

  // Keep first 3 characters, mask the rest
  return secret.slice(0, 3) + '*'.repeat(secret.length - 3);
}

/**
 * Helper to check if a hash is in the ignored matches list or set.
 */
function isHashSuppressed(hash: string, ignoredHashes?: Set<string> | string[]): boolean {
  if (!ignoredHashes) {
    return false;
  }
  if (ignoredHashes instanceof Set) {
    return ignoredHashes.has(hash);
  }
  return ignoredHashes.includes(hash);
}

/**
 * Evaluates context adjustments (e.g. test files, comments) to score confidence.
 */
function adjustConfidenceForContext(
  baseConfidence: FindingConfidence,
  context: string,
  filePath?: string,
  lineText?: string
): FindingConfidence {
  const isTestPath = filePath && /(?:\.test\.|\.spec\.|__tests__|fixtures?|mocks?)/i.test(filePath);
  const hasMockComment = lineText && /(?:\/\/|\/\*|#)\s*(?:mock|test|fixture|dummy|example|fake)/i.test(lineText);
  const isMockContext = !!(isTestPath || hasMockComment);

  if (baseConfidence === 'high') {
    return isMockContext ? 'medium' : 'high';
  }

  const hasSuspiciousName = /(?:api[_-]?key|secret|token|password|client[_-]?secret)/i.test(context);
  if (baseConfidence === 'low') {
    return hasSuspiciousName ? 'medium' : 'low';
  }

  return 'medium';
}

function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return Math.max(start1, start2) < Math.min(end1, end2);
}

/**
 * Scans a single line of text for secrets and returns all non-suppressed findings.
 */
export function scanLine(
  line: string,
  lineIndex: number,
  options: ScanOptions = {}
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const coveredRanges: Array<{ start: number; end: number }> = [];

  const entropyThreshold = options.entropyThreshold ?? DEFAULT_ENTROPY_THRESHOLD;
  const minEntropyLength = options.minEntropyLength ?? DEFAULT_MIN_ENTROPY_LENGTH;
  const genericEnabled = options.providers ? options.providers.generic !== false : true;

  // Split patterns into specific providers and generic fallback
  const specificRules = KNOWN_PATTERNS.filter((r) => r.provider !== 'generic');
  const genericRules = KNOWN_PATTERNS.filter((r) => r.provider === 'generic');

  const executeRule = (rule: PatternRule) => {
    // Check if provider is enabled
    if (options.providers && options.providers[rule.provider] === false) {
      return;
    }

    // Reset regex state for global regex
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.regex.exec(line)) !== null) {
      let secret: string;
      let startCol: number;

      if (rule.extractSecret) {
        const extracted = rule.extractSecret(match);
        secret = extracted.secret;
        startCol = match.index + extracted.offset;
      } else if (match[1] !== undefined) {
        secret = match[1];
        startCol = match.index + match[0].indexOf(secret);
      } else {
        secret = match[0];
        startCol = match.index;
      }

      const endCol = startCol + secret.length;

      // Skip if this range is already covered by a previous rule
      const alreadyCovered = coveredRanges.some((r) =>
        rangesOverlap(startCol, endCol, r.start, r.end)
      );
      if (alreadyCovered) {
        continue;
      }

      // Filter out obvious placeholders
      if (isObviousPlaceholder(secret)) {
        continue;
      }

      const hash = hashSecret(secret);
      if (isHashSuppressed(hash, options.ignoredHashes)) {
        continue;
      }

      const entropy = calculateShannonEntropy(secret);
      const context = extractLineContext(line, startCol);
      const confidence = adjustConfidenceForContext(
        rule.confidence,
        context,
        options.filePath,
        line
      );

      findings.push({
        type: rule.name,
        provider: rule.provider,
        match: maskSecret(secret),
        rawMatch: secret,
        line: lineIndex,
        column: startCol,
        endLine: lineIndex,
        endColumn: endCol,
        confidence,
        entropy,
        context,
        hash,
      });

      coveredRanges.push({ start: startCol, end: endCol });
    }
  };

  // 1. Pass: Specific provider patterns (AWS, Stripe, OpenAI, GitHub, etc.)
  for (const rule of specificRules) {
    executeRule(rule);
  }

  // 2. Pass: Generic pattern rules (assignment regex, private keys)
  if (genericEnabled) {
    for (const rule of genericRules) {
      executeRule(rule);
    }
  }

  // 3. Pass: Shannon Entropy on candidate string tokens (Generic provider fallback)
  if (genericEnabled) {
    const candidates = extractCandidateTokens(line, minEntropyLength);

    for (const candidate of candidates) {
      // Avoid duplicate reports if already covered by a pattern rule
      const alreadyCovered = coveredRanges.some((r) =>
        rangesOverlap(candidate.startColumn, candidate.endColumn, r.start, r.end)
      );
      if (alreadyCovered) {
        continue;
      }

      // Filter out placeholders
      if (isObviousPlaceholder(candidate.value)) {
        continue;
      }

      const entropy = calculateShannonEntropy(candidate.value);
      if (entropy >= entropyThreshold) {
        const hash = hashSecret(candidate.value);
        if (isHashSuppressed(hash, options.ignoredHashes)) {
          continue;
        }

        // Determine base confidence from entropy magnitude and context
        // Entropy-only is always low, unless promoted by suspicious assignment context
        let baseConfidence: FindingConfidence = 'low';

        const confidence = adjustConfidenceForContext(
          baseConfidence,
          candidate.context,
          options.filePath,
          line
        );

        findings.push({
          type: 'High-Entropy Secret',
          provider: 'generic',
          match: maskSecret(candidate.value),
          rawMatch: candidate.value,
          line: lineIndex,
          column: candidate.startColumn,
          endLine: lineIndex,
          endColumn: candidate.endColumn,
          confidence,
          entropy,
          context: candidate.context,
          hash,
        });

        coveredRanges.push({
          start: candidate.startColumn,
          end: candidate.endColumn,
        });
      }
    }
  }

  return findings;
}

/**
 * Scans an array of lines, with an optional starting line index offset.
 * Useful for scanning debounced changed ranges in onDidChangeTextDocument.
 */
export function scanLines(
  lines: string[],
  startLineIndex = 0,
  options: ScanOptions = {}
): SecretFinding[] {
  const allFindings: SecretFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineFindings = scanLine(lines[i], startLineIndex + i, options);
    allFindings.push(...lineFindings);
  }
  return allFindings;
}

/**
 * Scans full document text and returns all detected secret findings.
 */
export function scanText(text: string, options: ScanOptions = {}): SecretFinding[] {
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  return scanLines(lines, 0, options);
}
