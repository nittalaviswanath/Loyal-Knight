import * as path from 'node:path';
import { SentryConfig } from './types.js';

export function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === name) {
    return true;
  }
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return name.endsWith(ext);
  }
  return false;
}

/**
 * Determines whether a given file path should be ignored.
 * Whitelist overrides blacklist.
 */
export function isPathIgnored(
  filePath: string,
  config: Pick<SentryConfig, 'blacklist' | 'whitelist'>
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalized);

  // Always ignore .secretsentry folder itself
  if (normalized.includes('/.secretsentry/')) {
    return true;
  }

  // Whitelist overrides blacklist
  for (const pattern of config.whitelist.files) {
    if (matchesPattern(fileName, pattern) || normalized.endsWith(pattern)) {
      return false;
    }
  }
  for (const folder of config.whitelist.folders) {
    if (normalized.includes(`/${folder}/`)) {
      return false;
    }
  }

  // Check blacklist folders
  for (const folder of config.blacklist.folders) {
    if (
      normalized.includes(`/${folder}/`) ||
      normalized.endsWith(`/${folder}`) ||
      normalized === folder
    ) {
      return true;
    }
  }

  // Check blacklist files
  for (const pattern of config.blacklist.files) {
    if (matchesPattern(fileName, pattern)) {
      return true;
    }
  }

  return false;
}
