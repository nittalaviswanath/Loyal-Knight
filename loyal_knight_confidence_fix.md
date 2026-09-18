# LOYAL KNIGHT — Confidence Logic & Sidebar Cleanup

Fix LOYAL KNIGHT confidence logic and simplify the sidebar.

Do NOT add new features or rewrite the architecture.

## 1. Confidence Rules

- **HIGH** = exact provider-specific secret pattern with normal context
- **MEDIUM** = provider-specific pattern in mock/test context OR entropy secret assigned to suspicious names like `secret`, `apiKey`, `token`, `password`, `clientSecret`
- **LOW** = entropy-only random string with weak/generic context
- **Placeholder / ignored value** = no finding

## 2. Precedence

```text
placeholder -> none
provider pattern -> high
provider + mock/test context -> medium
entropy + suspicious variable -> medium
entropy-only generic -> low
```

## 3. Mock/Test Context

Treat these as mock/test context:

- Comments: `mock`, `test`, `fixture`, `dummy`, `example`, `fake`
- Files/folders: `.test.`, `.spec.`, `tests/`, `fixtures/`, `mocks/`, `__tests__/`

## 4. Deduplication

Do not duplicate provider findings with generic entropy findings.

Keep only the more specific provider match.

## 5. Diagnostic Mapping

- `high` = `DiagnosticSeverity.Error`
- `medium` = `DiagnosticSeverity.Warning`
- `low` = `DiagnosticSeverity.Information`

## 6. Dashboard Counts

Dashboard counts/icons must use `finding.confidence` directly.

Always satisfy:

```text
High + Medium + Low = Findings
```

## 7. Remove Redundant Actions

Remove these user-facing actions:

- Scan Current File
- Scan Workspace

Keep:

- Toggle Protection
- Scan Staged Changes (Git)
- Show Secret Flow Graph
- Open Settings

Do not remove internal scan functions needed for live scanning.

## 8. Keep Automatic Scanning

Keep:

- `onDidChangeTextDocument` with ~250ms debounce
- `onDidOpenTextDocument`
- `onDidSaveTextDocument`

## 9. Findings State

Remove stale/duplicate findings when code changes.

## 10. Acceptance Test

Use this in `demo.ts`:

```ts
const mockAws = "AKIA1234567890ABCDEF"; // mock credential for test
const mockStripe = "[STRIPE_SECRET_REDACTED_DUE_TO_GITHUB_PUSH_PROTECTION]"; // mock only
const value = "qK7zP9mX2wL5vR8bN1jH4cT6yF3sD0aE";
console.log("8Fj3Kp9Lm2Qa7Wx4Vz1Nc6Rt5Ys0Hd8B");
```

Expected:

```text
Findings: 4
High: 0
Medium: 2
Low: 2
```

Also verify normal AWS + Stripe patterns without mock context => **High**.

Finally:

```bash
npm run compile
```

Run tests, fix all errors, then report:

- files changed
- compile result
- test result
