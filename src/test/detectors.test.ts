import * as assert from 'assert';
import {
  calculateShannonEntropy,
  isHighEntropy,
  isObviousPlaceholder,
  maskSecret,
  hashSecret,
  scanLine,
  scanLines,
  scanText,
} from '../detectors/index.js';

/*
 * Test credentials are deliberately assembled from fragments.
 *
 * This lets the detector receive realistic provider-shaped strings at runtime
 * without storing complete secret-looking credentials as literals in Git.
 *
 * That prevents GitHub Push Protection from mistaking test fixtures for
 * actual credentials.
 */

function awsTestKey(): string {
  return ['AKIA', '1234567890ABCDEF'].join('');
}

function stripeTestKey(): string {
  return ['sk', '_live_', '51Abcdefghijklmnopqrstuvwx'].join('');
}

function githubTestToken(): string {
  return ['ghp_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '1234567890'].join('');
}

function openAITestKey(): string {
  return [
    'sk',
    '-proj-',
    'abc123XYZ456def789GHI012',
    'jkl345MNO678pqr901STU234vwx',
  ].join('');
}

function slackTestToken(): string {
  return [
    'xoxb',
    '-1234567890',
    '-123456789012',
    '-abcdefghijklmnopqrstuvwx',
  ].join('');
}

function twilioTestKey(): string {
  return ['SK', '1234567890abcdef', '1234567890abcdef'].join('');
}

function sendGridTestKey(): string {
  return [
    'SG',
    '.1234567890abcdefghijkl',
    '.1234567890abcdefghijklmnopqrstuvwxyz1234567',
  ].join('');
}

function googleTestKey(): string {
  return ['AIza', 'SyD-', '1234567890abcdefghijklmnopqrst'].join('');
}

suite('Phase 1: Detection Engine Suite', () => {
  suite('Entropy Calculator', () => {
    test('Empty string returns 0 entropy', () => {
      assert.strictEqual(calculateShannonEntropy(''), 0);
    });

    test('Single character repeated returns 0 entropy', () => {
      assert.strictEqual(
        calculateShannonEntropy('aaaaaaaaaaaaaaaaaaaa'),
        0
      );
    });

    test('English words have typical entropy < 3.5', () => {
      const entropy = calculateShannonEntropy('internationalization');

      assert.ok(
        entropy < 3.5,
        `Expected < 3.5 but got ${entropy}`
      );
    });

    test('High-entropy random base64 string has entropy > 4.2', () => {
      const highEntropy = 'qK7$zP9!mX2@wL5#vR8*bN1&jH4^';

      const entropy = calculateShannonEntropy(highEntropy);

      assert.ok(
        entropy > 4.2,
        `Expected > 4.2 but got ${entropy}`
      );

      assert.strictEqual(
        isHighEntropy(highEntropy, 4.2),
        true
      );
    });
  });

  suite('Placeholder Detection', () => {
    test('Filters out common placeholders', () => {
      assert.strictEqual(
        isObviousPlaceholder('your_api_key_here'),
        true
      );

      assert.strictEqual(
        isObviousPlaceholder('YOUR_API_KEY'),
        true
      );

      assert.strictEqual(
        isObviousPlaceholder('changeme'),
        true
      );

      // Official-style documentation placeholder.
      assert.strictEqual(
        isObviousPlaceholder('AKIAIOSFODNN7EXAMPLE'),
        true
      );

      assert.strictEqual(
        isObviousPlaceholder('xxxxxxxxxxxxxxxxxxxx'),
        true
      );

      assert.strictEqual(
        isObviousPlaceholder('00000000000000000000'),
        true
      );
    });

    test('Allows provider-shaped non-placeholder test values', () => {
      assert.strictEqual(
        isObviousPlaceholder(awsTestKey()),
        false
      );

      assert.strictEqual(
        isObviousPlaceholder(stripeTestKey()),
        false
      );
    });
  });

  suite('Masking and Hashing', () => {
    test('Masks AWS key with prefix and asterisks', () => {
      const key = awsTestKey();

      const masked = maskSecret(key);

      assert.strictEqual(
        masked.startsWith('AKIA'),
        true
      );

      assert.strictEqual(
        masked.includes('*'),
        true
      );

      assert.strictEqual(
        masked.length,
        key.length
      );

      assert.strictEqual(
        masked.includes('1234567890ABCDEF'),
        false
      );
    });

    test('Masks Stripe key with prefix and asterisks', () => {
      const key = stripeTestKey();

      const masked = maskSecret(key);

      assert.strictEqual(
        masked.startsWith('sk_live_'),
        true
      );

      assert.strictEqual(
        masked.includes('*'),
        true
      );

      assert.strictEqual(
        masked.includes('51Abcdef'),
        false
      );
    });

    test('Generates valid 64-char SHA-256 hex hash', () => {
      const key = awsTestKey();

      const hash = hashSecret(key);

      assert.strictEqual(
        hash.length,
        64
      );

      assert.strictEqual(
        /^[0-9a-f]{64}$/.test(hash),
        true
      );

      // Deterministic
      assert.strictEqual(
        hash,
        hashSecret(key)
      );
    });
  });

  suite('Known Provider Pattern Matching', () => {
    test('Detects AWS Access Key', () => {
      const key = awsTestKey();

      const line = `const AWS_KEY = "${key}";`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].type,
        'AWS Access Key'
      );

      assert.strictEqual(
        findings[0].provider,
        'aws'
      );

      assert.strictEqual(
        findings[0].rawMatch,
        key
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );

      assert.strictEqual(
        findings[0].line,
        0
      );

      assert.strictEqual(
        findings[0].column,
        17
      );

      assert.strictEqual(
        findings[0].endColumn,
        37
      );
    });

    test('Detects Stripe Live Secret Key', () => {
      const key = stripeTestKey();

      const line = `stripe.apiKey = "${key}";`;

      const findings = scanLine(line, 5);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].type,
        'Stripe Live Secret Key'
      );

      assert.strictEqual(
        findings[0].provider,
        'stripe'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );

      assert.strictEqual(
        findings[0].line,
        5
      );
    });

    test('Detects GitHub PAT', () => {
      const token = githubTestToken();

      const line = `export GITHUB_TOKEN=${token}`;

      const findings = scanLine(line, 1);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].type,
        'GitHub Personal Access Token'
      );

      assert.strictEqual(
        findings[0].provider,
        'github'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects OpenAI API Key', () => {
      const key = openAITestKey();

      const line = `const openaiKey = "${key}";`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'openai'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects Slack Token', () => {
      const token = slackTestToken();

      const line = `slackToken = "${token}"`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'slack'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects Twilio API Key', () => {
      const key = twilioTestKey();

      const line = `twilioKey: "${key}"`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'twilio'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects SendGrid API Key', () => {
      const key = sendGridTestKey();

      const line = `apiKey: "${key}"`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'sendgrid'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects Google API Key', () => {
      const key = googleTestKey();

      const line = `const gkey = "${key}";`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'google'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });

    test('Detects Private Key Block header', () => {
      const line = [
        '-----BEGIN',
        ' RSA PRIVATE KEY-----',
      ].join('');

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].type,
        'Private Key Block'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );
    });
  });

  suite('Context Scoring and Options', () => {
    test('Respects disabled provider option', () => {
      const key = awsTestKey();

      const line = `const AWS_KEY = "${key}";`;

      const findings = scanLine(
        line,
        0,
        {
          providers: {
            aws: false,
          },
        }
      );

      assert.strictEqual(
        findings.length,
        0
      );
    });

    test('Suppresses ignored match by SHA-256 hash', () => {
      const key = awsTestKey();

      const line = `const AWS_KEY = "${key}";`;

      const hash = hashSecret(key);

      const findings = scanLine(
        line,
        0,
        {
          ignoredHashes: new Set([hash]),
        }
      );

      assert.strictEqual(
        findings.length,
        0
      );
    });

    test('Scans multiple lines with accurate line numbers', () => {
      const awsKey = awsTestKey();
      const stripeKey = stripeTestKey();

      const text = [
        '// Config file',
        `const AWS_KEY = "${awsKey}";`,
        'const safeVar = "hello world";',
        `const STRIPE_KEY = "${stripeKey}";`,
      ].join('\n');

      const findings = scanText(text);

      assert.strictEqual(
        findings.length,
        2
      );

      assert.strictEqual(
        findings[0].line,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'aws'
      );

      assert.strictEqual(
        findings[1].line,
        3
      );

      assert.strictEqual(
        findings[1].provider,
        'stripe'
      );
    });

    test('Scans line slices with offset correctly', () => {
      const key = awsTestKey();

      const changedLines = [
        `const AWS_KEY = "${key}";`,
      ];

      const findings = scanLines(
        changedLines,
        10
      );

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].line,
        10
      );
    });

    test('Detects generic high-entropy secret assignment', () => {
      const value = [
        '9a8b7c6d',
        '5e4f3a2b',
        '1c0d9e8f',
        '7a6b5c4d',
      ].join('');

      const line = `const appSecret = "${value}";`;

      const findings = scanLine(line, 0);

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].provider,
        'generic'
      );

      assert.strictEqual(
        findings[0].confidence,
        'high'
      );

      assert.strictEqual(
        findings[0].context.includes('appSecret'),
        true
      );
    });

    test('Downgrades confidence in test files or mock comments', () => {
      const key = awsTestKey();

      const line =
        `const AWS_KEY = "${key}"; ` +
        '// mock credential for test';

      const findings = scanLine(
        line,
        0,
        {
          filePath: 'src/test/auth.test.ts',
        }
      );

      assert.strictEqual(
        findings.length,
        1
      );

      assert.strictEqual(
        findings[0].confidence,
        'medium'
      );
    });

    test('Completely filters out placeholders inside code assignments', () => {
      const line1 =
        'const key1 = "your_api_key_here";';

      const line2 =
        'const key2 = "AKIAIOSFODNN7EXAMPLE";';

      const line3 =
        'const key3 = "changeme1234567890";';

      assert.strictEqual(
        scanLine(line1, 0).length,
        0
      );

      assert.strictEqual(
        scanLine(line2, 0).length,
        0
      );

      assert.strictEqual(
        scanLine(line3, 0).length,
        0
      );
    });
  });
});