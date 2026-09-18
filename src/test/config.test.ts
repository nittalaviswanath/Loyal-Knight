import * as assert from 'assert';
import { DEFAULT_CONFIG } from '../config/types.js';
import { isPathIgnored, matchesPattern } from '../config/pathFilter.js';

suite('Configuration & Path Filtering Suite', () => {
  test('DEFAULT_CONFIG has scanning enabled and sensible defaults', () => {
    assert.strictEqual(DEFAULT_CONFIG.scanning.enabled, true);
    assert.strictEqual(DEFAULT_CONFIG.scanning.debounceMs, 250);
    assert.strictEqual(DEFAULT_CONFIG.scanning.entropyThreshold, 4.2);
    assert.ok(Array.isArray(DEFAULT_CONFIG.blacklist.folders));
    assert.ok(DEFAULT_CONFIG.blacklist.folders.includes('node_modules'));
    assert.ok(DEFAULT_CONFIG.blacklist.folders.includes('.git'));
  });

  test('matchesPattern matches exact names and extensions', () => {
    assert.strictEqual(matchesPattern('bundle.min.js', '*.min.js'), true);
    assert.strictEqual(matchesPattern('bundle.js', '*.min.js'), false);
    assert.strictEqual(matchesPattern('package-lock.json', 'package-lock.json'), true);
    assert.strictEqual(matchesPattern('other.json', 'package-lock.json'), false);
  });

  test('Correctly identifies blacklisted folder paths', () => {
    assert.strictEqual(
      isPathIgnored('c:/project/node_modules/package/index.js', DEFAULT_CONFIG),
      true
    );
    assert.strictEqual(
      isPathIgnored('c:/project/.git/HEAD', DEFAULT_CONFIG),
      true
    );
    assert.strictEqual(
      isPathIgnored('c:/project/.secretsentry/config.json', DEFAULT_CONFIG),
      true
    );
    assert.strictEqual(
      isPathIgnored('c:/project/out/extension.js', DEFAULT_CONFIG),
      true
    );
  });

  test('Correctly identifies blacklisted file extensions and lockfiles', () => {
    assert.strictEqual(
      isPathIgnored('c:/project/dist/bundle.min.js', DEFAULT_CONFIG),
      true
    );
    assert.strictEqual(
      isPathIgnored('c:/project/dist/bundle.js.map', DEFAULT_CONFIG),
      true
    );
    assert.strictEqual(
      isPathIgnored('c:/project/package-lock.json', DEFAULT_CONFIG),
      true
    );
  });

  test('Allows regular source files', () => {
    assert.strictEqual(
      isPathIgnored('c:/project/src/services/auth.ts', DEFAULT_CONFIG),
      false
    );
    assert.strictEqual(
      isPathIgnored('c:/project/api/server.js', DEFAULT_CONFIG),
      false
    );
  });
});
