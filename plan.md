# Detection Logic Issues & Enhancement Plan

## 1. Data Flow & AST Analysis Limitations (`src/analysis/astAnalyzer.ts`)

<!-- - **Missing Destructuring Support**: The analyzer currently completely ignores object and array destructuring. Statements like `const { API_KEY } = process.env` or `const { secret } = getSecret()` will not be tracked as secret sources or variables, breaking data flow tracking for these common patterns. -->
<!-- - **Incomplete Reassignment Tracking**: Reassignment tracking (e.g., `auth = token`) only handles simple identifiers. Property assignments like `config.apiKey = token` or `this.secret = token` are ignored, causing the extension to lose track of secrets in object-oriented or configuration-based code. -->

- **Rigid Sink Detection**: The HTTP and Logger sink detection matches exact simple text strings (e.g., `console.log`, `fetch`). It will fail to detect variants like `window.fetch`, `global.fetch`, `console.table`, `console.dir`, or other obscure variants of console logging.
- **Limited Function Parameter Tracking**: Parameter tracking works for functions defined in the same file but does not track arguments passed to imported functions beyond the hardcoded sinks.

## 2. Pattern Matching Limitations (`src/detectors/patterns.ts`)

- **Unsupported Template Literals**: The generic secret assignment and AWS secret key rules only check for single (`'`) and double (`"`) quotes, missing template literals (backticks).
- **Incomplete Stripe Key Pattern**: The Stripe publishable key pattern only detects `pk_live_`. It doesn't check for test keys (`pk_test_`). Although test keys have a lower severity, they should ideally be detected to warn the user.
<!-- - **Incomplete Private Key Detection**: The `private-key-header` pattern only matches the first line (e.g., `-----BEGIN PRIVATE KEY-----`). It does not capture the actual secret block content in the matched output. -->

## 3. Entropy & Context Analysis (`src/detectors/entropy.ts`)

<!-- - **TypeScript Type Syntax Breaking Context Extraction**: The `extractLineContext` function uses a regular expression `/(?:const|let|var|val)\s+([a-zA-Z0-9_$]+)\s*[:=]?\s*$/i` that fails to extract variable names if TypeScript type annotations are present (e.g., `const apiKey: string = ...`). -->

- **Multi-line Strings Ignored**: The `extractCandidateTokens` only parses token candidates line-by-line. If a high-entropy string spans multiple lines, it will not be properly evaluated for entropy.
