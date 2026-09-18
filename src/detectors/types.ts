/**
 * Detection engine types for SecretSentry / Loyal Knight.
 * Completely decoupled from VS Code APIs to allow standalone execution
 * in pre-commit hooks, CLI, and unit tests.
 */

export type FindingConfidence = 'low' | 'medium' | 'high';

export interface SecretFinding {
  /** Detector / secret rule name (e.g. "AWS Access Key", "OpenAI API Key") */
  type: string;
  /** Provider identifier (e.g. "aws", "stripe", "github", "openai", "slack", "twilio", "sendgrid", "google", "generic") */
  provider: string;
  /** Masked secret string safe for display/logging (e.g. "AKIA****************") */
  match: string;
  /** Raw secret string (kept for hashing and verification) */
  rawMatch: string;
  /** 0-indexed line number in document/buffer */
  line: number;
  /** 0-indexed start column */
  column: number;
  /** 0-indexed end line number */
  endLine: number;
  /** 0-indexed end column */
  endColumn: number;
  /** Confidence rating based on patterns, entropy, and context */
  confidence: FindingConfidence;
  /** Calculated Shannon entropy (bits per character) */
  entropy: number;
  /** Surrounding syntactic context description (e.g. "assigned to const AWS_KEY") */
  context: string;
  /** SHA-256 hex hash of raw match for suppression matching */
  hash: string;
}

export interface PatternRule {
  id: string;
  name: string;
  provider: string;
  regex: RegExp;
  confidence: FindingConfidence;
  extractSecret?: (match: RegExpExecArray) => { secret: string; offset: number };
}

export interface ProviderSettings {
  aws?: boolean;
  stripe?: boolean;
  github?: boolean;
  openai?: boolean;
  slack?: boolean;
  twilio?: boolean;
  sendgrid?: boolean;
  google?: boolean;
  generic?: boolean;
  [key: string]: boolean | undefined;
}

export interface ScanOptions {
  /** Enabled providers map. If provider is explicitly false, its patterns are skipped. */
  providers?: ProviderSettings;
  /** Minimum Shannon entropy for generic detections (default: 4.2) */
  entropyThreshold?: number;
  /** Set or list of SHA-256 hashes to suppress */
  ignoredHashes?: Set<string> | string[];
  /** File path being scanned, used for context awareness (e.g. tests or fixtures) */
  filePath?: string;
  /** Minimum length for generic string entropy candidates (default: 16) */
  minEntropyLength?: number;
}
