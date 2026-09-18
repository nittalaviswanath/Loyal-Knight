import { PatternRule } from './types.js';

/**
 * Pre-compiled pattern rules for known secret formats.
 * Compiled once at module load time for optimal scan performance.
 */
export const KNOWN_PATTERNS: PatternRule[] = [
  // AWS Access Keys (AKIA = permanent, ASIA = temporary STS, ABIA / ACCA)
  {
    id: 'aws-access-key',
    name: 'AWS Access Key',
    provider: 'aws',
    regex: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g,
    confidence: 'high',
  },
  // AWS Secret Access Key assignment
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Access Key',
    provider: 'aws',
    regex: /(?:aws_secret_access_key|aws_secret_key|secret_access_key)\s*[:=]\s*["'`]?([A-Za-z0-9/+=]{40})["'`]?/gi,
    confidence: 'high',
    extractSecret: (match) => ({
      secret: match[1],
      offset: match[0].indexOf(match[1]),
    }),
  },

  // Stripe Live Secret Keys & Restricted Keys
  {
    id: 'stripe-live-key',
    name: 'Stripe Live Secret Key',
    provider: 'stripe',
    regex: /\b((?:sk|rk)_live_[0-9a-zA-Z]{24,})\b/g,
    confidence: 'high',
  },
  // Stripe Publishable Live Keys
  {
    id: 'stripe-publishable-key',
    name: 'Stripe Live Publishable Key',
    provider: 'stripe',
    regex: /\b(pk_live_[0-9a-zA-Z]{24,})\b/g,
    confidence: 'medium',
  },
  // Stripe Test Secret Keys
  {
    id: 'stripe-test-key',
    name: 'Stripe Test Secret Key',
    provider: 'stripe',
    regex: /\b((?:sk|rk)_test_[0-9a-zA-Z]{24,})\b/g,
    confidence: 'low',
  },
  // Stripe Test Publishable Keys
  {
    id: 'stripe-test-publishable-key',
    name: 'Stripe Test Publishable Key',
    provider: 'stripe',
    regex: /\b(pk_test_[0-9a-zA-Z]{24,})\b/g,
    confidence: 'low',
  },

  // GitHub Personal Access Token (classic: ghp_...)
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    provider: 'github',
    regex: /\b(ghp_[0-9A-Za-z]{36})\b/g,
    confidence: 'high',
  },
  // GitHub Fine-Grained Personal Access Token (github_pat_...)
  {
    id: 'github-fine-grained-pat',
    name: 'GitHub Fine-Grained Personal Access Token',
    provider: 'github',
    regex: /\b(github_pat_[0-9a-zA-Z_]{82})\b/g,
    confidence: 'high',
  },
  // GitHub OAuth / Refresh / App Tokens
  {
    id: 'github-oauth-token',
    name: 'GitHub OAuth Access Token',
    provider: 'github',
    regex: /\b((?:gho|ghu|ghs|ghr)_[0-9A-Za-z]{36})\b/g,
    confidence: 'high',
  },

  // OpenAI API Key (legacy sk-48 and new sk-proj-... / project keys)
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    provider: 'openai',
    regex: /\b(sk-[a-zA-Z0-9]{48})\b/g,
    confidence: 'high',
  },
  {
    id: 'openai-project-key',
    name: 'OpenAI Project API Key',
    provider: 'openai',
    regex: /\b(sk-proj-[a-zA-Z0-9_\-]{48,})\b/g,
    confidence: 'high',
  },

  // Slack Tokens (Bot, User, Workspace, App)
  {
    id: 'slack-token',
    name: 'Slack Token',
    provider: 'slack',
    regex: /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g,
    confidence: 'high',
  },
  // Slack Webhook URL
  {
    id: 'slack-webhook',
    name: 'Slack Webhook URL',
    provider: 'slack',
    regex: /(https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8,12}\/B[a-zA-Z0-9_]{8,12}\/[a-zA-Z0-9_]{24})/g,
    confidence: 'high',
  },

  // Twilio API Key & Account SID
  {
    id: 'twilio-api-key',
    name: 'Twilio API Key',
    provider: 'twilio',
    regex: /\b(SK[0-9a-fA-F]{32})\b/g,
    confidence: 'high',
  },
  {
    id: 'twilio-account-sid',
    name: 'Twilio Account SID',
    provider: 'twilio',
    regex: /\b(AC[0-9a-fA-F]{32})\b/g,
    confidence: 'medium',
  },

  // SendGrid API Key
  {
    id: 'sendgrid-api-key',
    name: 'SendGrid API Key',
    provider: 'sendgrid',
    regex: /\b(SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43})\b/g,
    confidence: 'high',
  },

  // Google API Key (AIza followed by 32-40 chars)
  {
    id: 'google-api-key',
    name: 'Google API Key',
    provider: 'google',
    regex: /\b(AIza[0-9A-Za-z\-_]{32,40})\b/g,
    confidence: 'high',
  },

  // Private Key Blocks (RSA, EC, DSA, OPENSSH)
  {
    id: 'private-key-header',
    name: 'Private Key Block',
    provider: 'generic',
    regex: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)/g,
    confidence: 'high',
  },

  // Generic API Key / Secret / Token assignment pattern
  {
    id: 'generic-secret-assignment',
    name: 'Generic API Secret Assignment',
    provider: 'generic',
    regex: /(?:api[_-]?key|secret|auth[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'`]([a-zA-Z0-9_\-./+=]{16,})["'`]/gi,
    confidence: 'medium',
    extractSecret: (match) => ({
      secret: match[1],
      offset: match[0].indexOf(match[1]),
    }),
  },
];
