import * as assert from 'assert';
import { AstAnalyzer } from '../analysis/astAnalyzer.js';
import { SecretFinding } from '../detectors/types.js';

suite('AST Analysis & Secret Lifecycle Data-Flow Suite', () => {
  const analyzer = new AstAnalyzer();

  test('Traces process.env credential into variable and console.log sink (LOG EXPOSURE)', () => {
    const code = `
      const token = process.env.OPENAI_API_KEY;
      console.log("Debug token:", token);
    `;

    const flows = analyzer.analyzeDocument(code, 'test.js');
    assert.strictEqual(flows.length, 1);

    const flow = flows[0];
    assert.strictEqual(flow.highestRisk, 'CRITICAL');
    assert.strictEqual(flow.sinkType, 'logger');
    assert.ok(flow.summary.includes('process.env.OPENAI_API_KEY'));
    assert.ok(flow.summary.includes('token'));
    assert.ok(flow.summary.includes('console.log'));
  });

  test('Traces credential returned in res.json (FRONTEND CLIENT EXPOSURE)', () => {
    const code = `
      app.get('/api/user', (req, res) => {
        const secret = process.env.JWT_SECRET;
        res.json({ secret });
      });
    `;

    const flows = analyzer.analyzeDocument(code, 'server.js');
    assert.strictEqual(flows.length, 1);

    const flow = flows[0];
    assert.strictEqual(flow.highestRisk, 'CRITICAL');
    assert.strictEqual(flow.sinkType, 'frontend_response');
    assert.ok(flow.summary.includes('res.json') || flow.summary.includes('app.get'));
  });

  test('Traces credential into fetch HTTP request with static destination hostname', () => {
    const code = `
      const token = process.env.API_KEY;
      fetch("https://api.github.com/user", {
        headers: { Authorization: token }
      });
    `;

    const flows = analyzer.analyzeDocument(code, 'client.ts');
    assert.strictEqual(flows.length, 1);

    const flow = flows[0];
    assert.strictEqual(flow.sinkType, 'http');
    assert.ok(flow.summary.includes('api.github.com'));
    assert.strictEqual(flow.highestRisk, 'MEDIUM');
  });

  test('Traces credential into thrown Error message (ERROR EXPOSURE)', () => {
    const code = `
      const token = process.env.AUTH_TOKEN;
      throw new Error("Failed with token: " + token);
    `;

    const flows = analyzer.analyzeDocument(code, 'auth.ts');
    assert.strictEqual(flows.length, 1);

    const flow = flows[0];
    assert.strictEqual(flow.highestRisk, 'HIGH');
    assert.strictEqual(flow.sinkType, 'error');
  });

  test('Traces hardcoded secret findings through aliases into sinks', () => {
    const code = `
      const myKey = "AKIA1234567890ABCDEF";
      let auth = myKey;
      console.warn(auth);
    `;

    const fakeFinding: SecretFinding = {
      type: 'AWS Access Key',
      provider: 'aws',
      match: 'AKIA****************',
      rawMatch: 'AKIA1234567890ABCDEF',
      line: 1,
      column: 20,
      endLine: 1,
      endColumn: 40,
      confidence: 'high',
      entropy: 4.8,
      context: 'const myKey = "..."',
      hash: 'abc12345',
    };

    const flows = analyzer.analyzeDocument(code, 'config.js', [fakeFinding]);
    assert.ok(flows.length >= 1);

    const flow = flows[0];
    assert.strictEqual(flow.sinkType, 'logger');
    assert.strictEqual(flow.highestRisk, 'CRITICAL');
  });
});
