import { ProviderSettings } from '../detectors/types.js';

export interface ScanningConfig {
  enabled: boolean;
  debounceMs: number;
  entropyThreshold: number;
}

export interface PathFilterConfig {
  folders: string[];
  files: string[];
}

export interface IgnoredMatch {
  hash: string;
  reason?: string;
  addedAt?: string;
}

export interface SentryConfig {
  version: number;
  scanning: ScanningConfig;
  blacklist: PathFilterConfig;
  ignoredMatches: IgnoredMatch[];
  providers: ProviderSettings;
}

export const DEFAULT_CONFIG: SentryConfig = {
  version: 1,
  scanning: {
    enabled: true,
    debounceMs: 250,
    entropyThreshold: 4.2,
  },
  blacklist: {
    folders: ['node_modules', 'dist', '.git', 'vendor', 'out', '.secretsentry', '.vscode'],
    files: ['*.min.js', '*.map', 'package-lock.json', 'package.json', 'yarn.lock', 'pnpm-lock.yaml'],
  },
  ignoredMatches: [],
  providers: {
    aws: true,
    stripe: true,
    github: true,
    openai: true,
    slack: true,
    twilio: true,
    sendgrid: true,
    google: true,
    generic: true,
  },
};
