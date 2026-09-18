# Loyal Knight --- Local API Leak & Secret Lifecycle Security Extension

## Complete Build Plan for Antigravity

### 1. Project Goal

Build a VS Code extension that protects developers from API-key and
secret leaks while they are coding.

The extension must work primarily on the user's local machine. It should
continuously analyze code changes, detect potential secrets using
multiple signals, understand the situation in which a suspicious value
appears, trace probable secret/data flows through the application, and
identify unsafe exposure points.

The product is NOT just a regex API-key detector.

## Product Name

**Loyal Knight**

Use **Loyal Knight** as the official product/extension name throughout the implementation, UI, commands, documentation, demo, and branding.

Suggested tagline:

> **Loyal Knight — Your code's security guardian.**

The extension should feel like a security knight that continuously guards the developer's code locally.

The core product has two connected capabilities:

1.  **Secret Detection**
    -   Detect API keys, access tokens, JWTs, cloud credentials,
        database credentials, private keys, passwords and other
        credential-like values.
    -   Use provider-specific patterns where known.
    -   Use entropy analysis for unknown/random-looking secrets.
    -   Use contextual/situational analysis to reduce false positives.
    -   Assign a risk level and explain why the finding is suspicious.
2.  **Secret Lifecycle / Exposure Analysis**
    -   For a detected secret or secret source, determine as much as
        possible about:
        -   Where did the credential come from?
        -   Which variable/function received it?
        -   Where was it transformed?
        -   Which function/module used it?
        -   Did it reach a logger?
        -   Did it reach an HTTP request?
        -   Did it enter an HTTP response/frontend response?
        -   Did it reach an error message?
        -   Did it reach telemetry/analytics?
    -   Represent the result as a local data-flow graph.
    -   Highlight dangerous sinks and explain the exposure path.

The product should focus first on JavaScript/TypeScript because that
gives the team a realistic and strong MVP inside VS Code.

------------------------------------------------------------------------

# 2. Product Vision

The extension should behave like a security guard inside the developer's
editor.

Example:

``` text
Developer writes:

const token = process.env.OPENAI_API_KEY;
console.log("token:", token);

                ↓

Loyal Knight detects:

🔴 HIGH RISK SECRET EXPOSURE

Secret source:
process.env.OPENAI_API_KEY

Flow:
Environment variable
      ↓
token
      ↓
console.log()
      ↓
Potential log exposure

Recommended action:
Remove the secret from the log statement.
```

Another example:

``` text
const token = process.env.API_TOKEN;

fetch("https://api.example.com", {
    headers: {
        Authorization: `Bearer ${token}`
    }
});
```

The extension should show:

``` text
Secret source
    ↓
token
    ↓
fetch()
    ↓
Authorization header
    ↓
External network request

Status:
🟡 Sensitive credential sent to external service

Context:
This may be intentional authentication.
Verify that the destination is trusted.
```

The system must distinguish between a secret being used legitimately for
authentication and a secret being exposed to an unsafe destination.

------------------------------------------------------------------------

# 3. Core Design Principle

Do NOT make the product depend on one detection method.

Use multiple signals:

``` text
Provider Pattern
       +
Generic Secret Pattern
       +
Entropy
       +
Variable/Identifier Context
       +
AST Context
       +
Data-flow Context
       +
Sink Analysis
       =
Risk Assessment
```

The goal is not simply:

"Does this string look like an API key?"

The goal is:

"How likely is this to be sensitive, how is it being used, and does it
reach an unsafe boundary?"

------------------------------------------------------------------------

# 4. Scope of MVP

## Primary language

Support:

-   JavaScript
-   TypeScript
-   Common Node.js projects

Do not try to support every language initially.

## Primary IDE

VS Code.

## Primary execution model

Local-first.

The source code should not be uploaded to a remote server for normal
scanning.

## Initial supported secret sources

Examples:

-   process.env
-   .env files
-   configuration objects
-   hardcoded credential assignments
-   JSON configuration
-   common secret manager access patterns
-   function parameters named like token/key/secret/password
-   API client configuration

## Initial supported sinks

Start with a small, high-value set:

### Logging

-   console.log
-   console.error
-   console.warn
-   common logger calls

### HTTP

-   fetch
-   axios
-   Node HTTP/HTTPS APIs
-   common request libraries

### Backend responses

-   Express res.json
-   res.send
-   res.end
-   common response patterns

### Error exposure

-   Error constructor
-   thrown errors
-   error logging
-   common error response patterns

### Telemetry

Create a configurable sink system so telemetry libraries can be added
later.

------------------------------------------------------------------------

# 5. User Experience

## Extension On/Off Toggle

Loyal Knight must have a clear way to enable or disable protection.

Provide both:

1. A **status-bar toggle** where practical.
2. A **VS Code setting** such as:

```text
loyalKnight.enabled
```

The status bar should clearly indicate the current state:

```text
🛡 Loyal Knight: ON
```

or:

```text
⚪ Loyal Knight: OFF
```

Clicking the status indicator should toggle the extension.

When OFF:

- Do not perform live scanning.
- Do not perform save-triggered scans.
- Do not show new security diagnostics.
- Do not run background analysis.
- Do not silently consume significant CPU/RAM.

When turned back ON:

- Resume live scanning.
- Scan the currently active document once.
- Update diagnostics.

The extension should preserve the user's ON/OFF preference between VS Code sessions.

## Separate Scan on Every Save

Every time the user saves a supported source file, Loyal Knight must perform a **separate save-triggered security scan**.

This scan is different from the lightweight live scan.

Workflow:

```text
User edits code
      ↓
Live scan
      ↓
Fast findings
      ↓
User presses Ctrl/Cmd + S
      ↓
SAVE EVENT
      ↓
Dedicated Save Scan
      ↓
Thorough file analysis
      ↓
AST analysis
      ↓
Entropy analysis
      ↓
Context analysis
      ↓
Relevant data-flow analysis
      ↓
Diagnostics updated
```

The save scan must not simply reuse stale live-scan results.

It should explicitly re-analyze the saved document and update the finding state.

Track the scan reason internally:

```text
LIVE
SAVE
MANUAL
STAGED_CHANGE
```

This allows the dashboard and debugging logs to distinguish how a finding was discovered.

The save scan should be asynchronous and must never freeze the VS Code UI.

For larger files, perform heavier analysis in the extension host/background execution path and update the UI when the result is ready.

The user should be able to see that a save scan happened, for example through a short status-bar update:

```text
🛡 Loyal Knight
Saved scan: 1.2s
No new secrets
```

or:

```text
🛡 Loyal Knight
Saved scan complete
🔴 2 findings
```

Do not create notification popups on every clean save because that would become annoying. Use the status bar/dashboard for normal scan completion and reserve popups for important findings.

# 5.1 Live detection


## A. Live detection

When a developer edits a file:

``` text
User types
    ↓
VS Code document change event
    ↓
Debounce
    ↓
Scan changed region/file
    ↓
Update diagnostics
```

Do NOT scan the entire workspace on every keystroke.

Use incremental analysis.

Recommended initial debounce:

300--700 ms.

Make it configurable later.

------------------------------------------------------------------------

# 6. VS Code UI

## Commands

Register these commands in `package.json`:

```text
Loyal Knight: Toggle Protection
Loyal Knight: Scan Current File
Loyal Knight: Scan Workspace
Loyal Knight: Scan Staged Changes
Loyal Knight: Show Security Dashboard
Loyal Knight: Show Secret Flow
```

At minimum, the MVP must implement:

- Toggle Protection
- Scan Current File
- Scan Workspace

The Save Scan must happen automatically on every save while Loyal Knight is ON.

## Diagnostics

Use VS Code diagnostics for findings.

Example:

``` text
const API_KEY = "sk-xxxx";
              ^^^^^^^^^^^^^
              Possible secret
```

Severity:

-   Error = high-confidence/high-risk exposure
-   Warning = suspicious secret
-   Information = low-confidence finding

## Hover

Hovering over the finding should show:

``` text
Loyal Knight

Potential API credential

Detection:
Provider pattern + high entropy + sensitive variable name

Risk:
HIGH

Reason:
Credential is hardcoded in application source.

[View Analysis]
[Fix]
[Ignore]
```

## Code actions

Provide:

-   Move to environment variable
-   Mask value
-   Ignore finding
-   Mark as false positive
-   Add rule
-   View data flow

## Sidebar

Create a dedicated activity-bar view:

``` text
SECRET FLOW GUARD

Workspace Security
-------------------
Files scanned: 143
Findings: 5

🔴 High      2
🟠 Medium    2
🟡 Low       1

Recent findings
-------------------
src/config.ts:14
backend/auth.ts:31
frontend/api.ts:52
```

------------------------------------------------------------------------

# 7. Detection Engine

Create a modular detector engine.

Suggested folder:

``` text
src/
  detection/
    detector.ts
    patternDetector.ts
    entropyDetector.ts
    contextDetector.ts
    detectorRegistry.ts
    normalizer.ts
```

## Detector interface

Every detector should return a normalized finding.

Conceptually:

``` text
Finding
{
    type,
    location,
    confidence,
    risk,
    evidence,
    secretKind,
    maskedValue,
    source
}
```

Do not store or display full secret values unnecessarily.

------------------------------------------------------------------------

# 8. Provider Pattern Detection

Create a rule database.

Example conceptual rule:

``` text
Provider:
ExampleProvider

Name:
Example API Key

Pattern:
provider-specific pattern

Expected prefix:
...

Entropy threshold:
...

Validation:
optional
```

The actual implementation should include legitimate provider formats
that can be safely documented and tested.

Start with a small set of common providers rather than hundreds of
patterns.

The architecture must allow new rules to be added without rewriting the
scanner.

------------------------------------------------------------------------

# 9. Generic Secret Detection

Detect generic patterns such as:

``` text
api_key
apikey
api-key
secret
secret_key
access_token
auth_token
bearer
password
private_key
client_secret
database_url
```

But variable names alone must NEVER automatically mean a secret exists.

For example:

``` js
const apiKey = "demo";
```

should be treated differently from a high-entropy credential.

Use context.

------------------------------------------------------------------------

# 10. Entropy Analysis

Implement Shannon entropy for candidate strings.

Conceptually:

``` text
H(X) = -Σ p(x) log2 p(x)
```

Entropy should be used as one signal, not the final decision.

Example:

``` text
hello
→ low entropy

A7f92KxQm91Zp3
→ higher entropy
```

Important:

High entropy does NOT automatically mean secret.

Examples of legitimate high-entropy strings:

-   hashes
-   UUIDs
-   compressed data
-   generated IDs
-   random test data
-   asset fingerprints

Therefore combine entropy with:

-   variable name
-   surrounding syntax
-   provider pattern
-   value length
-   location
-   usage
-   sink
-   file type

------------------------------------------------------------------------

# 11. Situational / Context Analysis

This is a major part of the product.

The detector should examine the surrounding code.

Example:

``` js
const API_KEY = "abc123";
```

Potentially suspicious.

But:

``` js
const API_KEY = "YOUR_API_KEY_HERE";
```

is probably a placeholder.

Similarly:

``` js
const testToken = "test-token";
```

may be test data.

Context signals should include:

### Identifier context

Words such as:

-   api
-   key
-   token
-   secret
-   password
-   auth
-   credential

### Value context

Check whether the value:

-   matches a known provider format
-   has high entropy
-   has suspicious length
-   resembles a JWT
-   resembles a connection string
-   contains credential syntax

### Code context

Check whether the value is:

-   assigned to authentication configuration
-   passed to an HTTP client
-   inserted into Authorization headers
-   returned to a client
-   logged
-   included in errors

### File context

Consider:

-   src/
-   test/
-   fixtures/
-   examples/
-   documentation
-   generated files
-   lock files

Tests/examples should reduce confidence but should not automatically
suppress findings.

------------------------------------------------------------------------

# 12. Risk Engine

Create a separate risk engine.

Do not mix detection and risk scoring.

Conceptually:

``` text
Detection confidence
        +
Secret sensitivity
        +
Exposure sink
        +
External destination
        +
Frontend boundary
        +
Logging/telemetry
        +
Repository context
        =
Risk level
```

Risk levels:

``` text
CRITICAL
HIGH
MEDIUM
LOW
INFO
```

Avoid pretending the risk score is mathematically perfect.

The score should be explainable.

Example:

``` text
Risk: HIGH

Reasons:
+ Known credential pattern
+ High-confidence secret context
+ Hardcoded in application source
+ Passed into HTTP authorization header
```

------------------------------------------------------------------------

# 13. Secret Lifecycle / Data Flow Engine

This is the differentiating part.

The engine should build a simplified data-flow graph.

Example:

``` text
process.env.API_KEY
        ↓
      token
        ↓
 authenticate(token)
        ↓
 requestConfig.headers
        ↓
 fetch(...)
```

The engine should answer:

``` text
Source
  ↓
Variables
  ↓
Functions
  ↓
Transformations
  ↓
Sinks
```

------------------------------------------------------------------------

# 14. AST Analysis

Use an AST parser rather than only regular expressions.

For JavaScript/TypeScript, consider:

-   TypeScript compiler API
-   Babel parser
-   ts-morph
-   another well-maintained AST library

The AST lets the engine understand structures such as:

``` js
const token = process.env.TOKEN;
```

and:

``` js
function authenticate(token) {
    sendRequest(token);
}
```

Instead of treating the file as plain text.

------------------------------------------------------------------------

# 15. Variable Tracking

Start with local variable tracking.

Example:

``` js
const token = process.env.API_KEY;
send(token);
```

Graph:

``` text
API_KEY
   ↓
token
   ↓
send()
```

Then support assignments:

``` js
let token = process.env.API_KEY;
let auth = token;
send(auth);
```

Graph:

``` text
API_KEY
 ↓
token
 ↓
auth
 ↓
send()
```

------------------------------------------------------------------------

# 16. Function Tracking

Support simple function arguments.

Example:

``` js
const token = process.env.API_KEY;

function makeRequest(authToken) {
    fetch(url, {
        headers: {
            Authorization: authToken
        }
    });
}

makeRequest(token);
```

The engine should attempt:

``` text
API_KEY
  ↓
token
  ↓
makeRequest(token)
  ↓
authToken
  ↓
Authorization
  ↓
fetch()
```

Do not claim complete interprocedural analysis in v1.

Mark uncertain edges.

Example:

``` text
───── probable flow ─────>
```

instead of presenting an inference as absolute fact.

------------------------------------------------------------------------

# 17. Transformation Tracking

Track simple transformations.

Examples:

``` js
const auth = "Bearer " + token;
```

``` js
const auth = `Bearer ${token}`;
```

``` js
const encoded = Buffer.from(token).toString("base64");
```

The graph should show:

``` text
token
  ↓
Bearer + token
  ↓
Authorization header
```

For complex cryptographic transformations, mark the flow as uncertain
rather than pretending to recover the original secret.

------------------------------------------------------------------------

# 18. Dangerous Sink Detection

A sink is a location where sensitive data may become exposed.

## Logger sink

``` js
console.log(token);
```

Graph:

``` text
SECRET
 ↓
token
 ↓
console.log()
 ↓
🔴 LOG EXPOSURE
```

## HTTP sink

``` js
fetch(url, {
    headers: {
        Authorization: token
    }
});
```

Graph:

``` text
SECRET
 ↓
token
 ↓
Authorization header
 ↓
HTTP request
 ↓
External service
```

The system should determine whether this is expected authentication or
suspicious transmission.

## Frontend exposure

Example:

``` js
res.json({
    token: token
});
```

Potential flow:

``` text
SECRET
 ↓
Backend
 ↓
HTTP response
 ↓
Frontend
 ↓
🔴 CLIENT EXPOSURE
```

This should be one of the major demo scenarios.

## Error sink

Example:

``` js
throw new Error(`Authentication failed: ${token}`);
```

Potential:

``` text
SECRET
 ↓
Error message
 ↓
Logger / response
 ↓
🔴 Exposure
```

## Telemetry sink

Example:

``` js
telemetry.track("request", {
    token
});
```

Potential:

``` text
SECRET
 ↓
Telemetry event
 ↓
Third-party analytics system
 ↓
🔴 Potential exposure
```

------------------------------------------------------------------------

# 19. Destination Awareness

For network flows, capture the destination when statically available.

Example:

``` js
fetch("https://api.example.com", ...)
```

Display:

``` text
Destination:
api.example.com
```

If the URL is dynamic:

``` js
fetch(baseUrl + endpoint, ...)
```

display:

``` text
Destination:
Unknown / dynamic
```

Do not guess.

------------------------------------------------------------------------

# 20. Secret Exposure Graph

Create a graph representation.

Example:

``` text
             ┌────────────────────┐
             │ process.env.API_KEY│
             └─────────┬──────────┘
                       │
                       ▼
                    token
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
       console.log             fetch()
            │                     │
            ▼                     ▼
       🔴 LOG LEAK        Authorization Header
                                  │
                                  ▼
                            External API
```

The UI should allow clicking a node to jump to the source line.

------------------------------------------------------------------------

# 21. Local Runtime-Assisted Analysis

This should be an advanced phase, not required for the first MVP.

Static analysis cannot see everything.

For selected supported projects, optionally provide a local runtime
monitor.

Potential approach:

``` text
VS Code Extension
      ↓
Start application in controlled mode
      ↓
Local instrumentation
      ↓
Observe selected sensitive-data flows
      ↓
Report runtime observations
```

Use this only with explicit user action.

Never silently execute arbitrary project code.

The runtime layer should be sandboxed/controlled as much as practical
and should never upload source code or secret values.

------------------------------------------------------------------------

# 22. Performance Architecture

Performance is critical.

Never perform a full workspace scan on every keystroke.

Use:

``` text
Typing
  ↓
Debounce
  ↓
Changed document
  ↓
Fast lexical/pattern scan
  ↓
AST update
  ↓
Relevant local flow analysis
```

Heavy analysis should run separately.

## Three scan levels

### Level 1 --- Live scan

Fast:

-   changed document
-   changed region if practical
-   provider patterns
-   generic patterns
-   entropy
-   lightweight context

Target: minimal UI latency.

### Level 2 --- File scan

Triggered by save or command.

More thorough:

-   complete AST
-   data-flow
-   sinks
-   project context

### Level 3 --- Workspace/Git scan

Explicit command or background task:

-   workspace
-   staged changes
-   optionally Git history

Do not make Git-history analysis part of every keystroke.

------------------------------------------------------------------------

# 23. Memory Strategy

Avoid storing full source files unnecessarily.

Use:

-   line/character ranges
-   hashes/fingerprints
-   normalized findings
-   AST caches
-   dependency-aware caches
-   incremental invalidation

Do not store complete secret values in global state.

Mask values:

``` text
sk-proj-...7A91
```

rather than:

``` text
sk-proj-full-secret-value
```

------------------------------------------------------------------------

# 24. Finding Deduplication

A secret may be detected by multiple detectors.

Example:

``` text
Provider detector
Entropy detector
Context detector
```

These should become one finding:

``` text
Finding:
Potential OpenAI API credential

Evidence:
✓ Provider pattern
✓ High entropy
✓ Sensitive variable name
```

Do not show three separate warnings for the same secret.

------------------------------------------------------------------------

# 25. False Positive Handling

The product must make false positives easy to handle.

Actions:

``` text
Ignore once
Ignore file
Ignore rule
Mark as test value
Add to allowlist
```

But don't permanently suppress a secret merely because the user clicks
Ignore.

Use explicit configuration.

------------------------------------------------------------------------

# 26. Safe Auto-Remediation

For simple cases:

Before:

``` js
const API_KEY = "secret";
```

After:

``` js
const API_KEY = process.env.API_KEY;
```

And create/update:

``` text
.env
```

and:

``` text
.gitignore
```

Important:

Do NOT automatically write real secret values into files without clear
user confirmation.

The safest workflow is:

``` text
Detect
 ↓
Preview fix
 ↓
User confirms
 ↓
Apply
```

------------------------------------------------------------------------

# 27. Configuration

Add a dedicated Loyal Knight configuration section to VS Code settings.

Example:

```text
loyalKnight.enabled
loyalKnight.liveScan.enabled
loyalKnight.scanOnSave.enabled
loyalKnight.scanOnSave.debounceMs
loyalKnight.entropy.enabled
loyalKnight.contextAnalysis.enabled
loyalKnight.dataFlow.enabled
loyalKnight.gitScan.enabled
```

Recommended defaults:

```text
loyalKnight.enabled = true
loyalKnight.liveScan.enabled = true
loyalKnight.scanOnSave.enabled = true
loyalKnight.scanOnSave.debounceMs = 300
loyalKnight.entropy.enabled = true
loyalKnight.contextAnalysis.enabled = true
loyalKnight.dataFlow.enabled = true
loyalKnight.gitScan.enabled = true
```

The user must be able to independently turn features on/off.

The global `loyalKnight.enabled` setting is the master switch.

## Save-Scan Requirements

The save scan is a first-class feature and must be treated separately from live scanning.

On:

```text
workspace.onDidSaveTextDocument
```

for supported files:

1. Check whether Loyal Knight is enabled.
2. Check whether save scanning is enabled.
3. Cancel/ignore obsolete analysis for an older version of the same document.
4. Read the newly saved document.
5. Run the complete file-level detection pipeline.
6. Run relevant AST/context analysis.
7. Run relevant data-flow analysis.
8. Merge/deduplicate findings.
9. Replace diagnostics for that document.
10. Update dashboard statistics.
11. Record scan metadata locally.

Do not show the complete secret in logs or scan metadata.

A scan record should contain information such as:

```text
timestamp
file
scanType = SAVE
duration
findingsCount
highRiskCount
```

but not the raw credential.

# 27. Git Integration

Add an explicit command:

``` text
Loyal Knight: Scan Staged Changes
```

Later:

``` text
Loyal Knight: Scan Commit
```

The staged-diff scanner should prioritize newly introduced secrets.

Example:

``` text
2 secrets found in staged changes

🔴 src/config.ts:14
   API credential

🟠 backend/auth.ts:31
   Suspicious token

Commit blocked/recommended:
Review findings before committing.
```

Make blocking configurable.

------------------------------------------------------------------------

# 28. Dashboard

Create a local dashboard.

Sections:

``` text
SECURITY OVERVIEW

Secrets
-------
2 Critical
3 High
1 Medium

Exposure
--------
1 Log exposure
2 Network flows
1 Frontend exposure

Project
-------
247 files scanned
43 files analyzed
6 findings
```

Also show:

``` text
Most recent findings
Most exposed sinks
Secret sources
Flow paths
```

------------------------------------------------------------------------

# 29. Explainability

Every alert should answer:

1.  What did we detect?
2.  Why do we think it is sensitive?
3.  Where did it originate?
4.  Where did it flow?
5.  Why is the destination risky?
6.  What should the developer check/fix?

Example:

``` text
HIGH RISK

Detected:
Possible API credential

Evidence:
- Credential-like variable name
- High entropy
- Used in Authorization header

Flow:
process.env.API_KEY
 → token
 → authenticate()
 → fetch()
 → Authorization header

Potential issue:
Credential is being transmitted to a dynamically
constructed external destination.

Confidence:
High for secret detection
Medium for destination analysis
```

------------------------------------------------------------------------

# 30. Important Security Rule

Never expose the detected secret in the extension UI unless absolutely
necessary.

Use masking.

Do not send secrets to an external AI service by default.

If an AI feature is eventually added, make it optional and
privacy-aware.

The deterministic local scanner should work without an AI API.

------------------------------------------------------------------------

# 31. Recommended Project Structure

``` text
secretflow-guard/
│
├── src/
│   ├── extension.ts
│   │
│   ├── detection/
│   │   ├── detector.ts
│   │   ├── providerPatterns.ts
│   │   ├── genericPatterns.ts
│   │   ├── entropy.ts
│   │   ├── contextAnalyzer.ts
│   │   ├── detectorRegistry.ts
│   │   └── finding.ts
│   │
│   ├── analysis/
│   │   ├── astAnalyzer.ts
│   │   ├── symbolTable.ts
│   │   ├── dataFlow.ts
│   │   ├── functionFlow.ts
│   │   ├── transformations.ts
│   │   └── sinkAnalyzer.ts
│   │
│   ├── risk/
│   │   ├── riskEngine.ts
│   │   ├── riskRules.ts
│   │   └── explanations.ts
│   │
│   ├── remediation/
│   │   ├── fixEngine.ts
│   │   ├── envFix.ts
│   │   └── gitignoreFix.ts
│   │
│   ├── git/
│   │   ├── gitDiff.ts
│   │   └── stagedScanner.ts
│   │
│   ├── runtime/
│   │   └── runtimeMonitor.ts
│   │
│   ├── ui/
│   │   ├── dashboard.ts
│   │   ├── treeProvider.ts
│   │   ├── flowView.ts
│   │   └── webview/
│   │
│   ├── cache/
│   │   └── analysisCache.ts
│   │
│   └── utils/
│       ├── masking.ts
│       ├── debounce.ts
│       └── hashing.ts
│
├── rules/
│   ├── providers/
│   └── custom/
│
├── test/
│   ├── detection/
│   ├── entropy/
│   ├── context/
│   ├── dataflow/
│   └── integration/
│
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

------------------------------------------------------------------------

# 32. Development Phases

## Phase 1 --- Extension skeleton

Build:

-   VS Code extension
-   TypeScript
-   activation
-   command
-   diagnostics
-   basic UI

Success criterion:

The extension installs and displays a test warning.

------------------------------------------------------------------------

## Phase 2 --- Basic secret detector

Implement:

-   provider patterns
-   generic patterns
-   entropy
-   masking
-   finding model

Success criterion:

Hardcoded sample credentials are detected.

------------------------------------------------------------------------

## Phase 3 --- Context analysis

Implement:

-   identifier context
-   surrounding syntax
-   AST
-   test/example awareness
-   confidence

Success criterion:

False positives are substantially reduced compared with regex-only
detection.

------------------------------------------------------------------------

## Phase 4 --- Live scanning

Implement:

-   document change events
-   debounce
-   incremental scanning
-   diagnostics updates
-   caching

Success criterion:

Developer can type normally without noticeable lag while findings appear
quickly.

------------------------------------------------------------------------

## Phase 5 --- Data-flow engine

Implement:

-   variable tracking
-   assignments
-   function arguments
-   basic transformations
-   source-to-sink graph

Success criterion:

Trace:

``` text
process.env.TOKEN
→ token
→ function
→ HTTP request
```

------------------------------------------------------------------------

## Phase 6 --- Dangerous sinks

Add:

-   console
-   logger
-   fetch
-   axios
-   Express response
-   errors
-   telemetry

Success criterion:

The extension identifies probable exposure paths.

------------------------------------------------------------------------

## Phase 7 --- Visual flow graph

Implement:

-   graph UI
-   clickable nodes
-   source location
-   sink location
-   confidence labels

Success criterion:

Judge can visually understand a secret's lifecycle in seconds.

------------------------------------------------------------------------

## Phase 8 --- Auto-remediation

Implement:

-   move hardcoded secret to env
-   .env template
-   .gitignore check
-   safe preview
-   confirmation

Success criterion:

A detected hardcoded secret can be safely converted into
environment-variable usage.

------------------------------------------------------------------------

## Phase 9 --- Git integration

Implement:

-   staged diff scan
-   commit-oriented findings
-   optional blocking
-   Git history scan as an advanced feature

Success criterion:

A secret introduced into a staged change is detected before push.

------------------------------------------------------------------------

## Phase 10 --- Runtime-assisted analysis

Only after the static system works.

Implement carefully:

-   explicit opt-in
-   supported runtimes
-   controlled execution
-   runtime observations
-   merge static + runtime evidence

Success criterion:

Demonstrate a secret that is assembled or obtained at runtime and cannot
be confidently identified through simple static pattern matching alone.

------------------------------------------------------------------------

# 33. Testing Strategy

Create a safe synthetic test corpus.

Never use real production credentials.

Include:

## True positives

``` text
Fake provider-style keys
Fake JWTs
Fake bearer tokens
Fake cloud credentials
Fake database credentials
```

## False positives

``` text
UUIDs
hashes
test tokens
placeholders
documentation examples
random IDs
CSS hashes
build artifacts
```

## Flow tests

``` text
Secret → variable → logger
Secret → variable → fetch
Secret → function → fetch
Secret → backend → response
Secret → error
Secret → telemetry
```

------------------------------------------------------------------------

# 34. Benchmarking

Measure:

-   scan latency
-   CPU usage
-   memory usage
-   files scanned per second
-   false positives
-   true positives
-   data-flow analysis time

Create benchmark projects:

``` text
Small:
1,000 lines

Medium:
10,000 lines

Large:
100,000+ lines
```

For live scanning, measure latency after a document edit.

Do not optimize prematurely. Measure first.

------------------------------------------------------------------------

# 35. Performance Targets

These are engineering targets, not guaranteed results.

Aim for:

``` text
Live detection:
<100–300 ms for typical changed files

Small file:
near-instant

Workspace scan:
background operation

Heavy flow analysis:
background operation

Memory:
avoid loading entire repositories into memory
```

If a scan is slow, do not block the VS Code UI.

Use asynchronous/background work where appropriate.

------------------------------------------------------------------------

# 36. Hackathon Demo

## Demo 0 — Loyal Knight Toggle

Start with:

```text
🛡 Loyal Knight: ON
```

Type a fake demo secret.

Show detection.

Then click the status-bar toggle:

```text
🛡 Loyal Knight: OFF
```

Modify the file.

No live scan should occur.

Save the file.

No save scan should occur.

Turn it back ON:

```text
🛡 Loyal Knight: ON
```

Loyal Knight should immediately scan the active document again.

This proves that the developer controls when the security guard is active.

## Demo 1 — Instant detection

Type:

```js
const API_KEY = "FAKE_DEMO_SECRET_123456789";
```

Show immediate warning.

## Demo 2 — Save-triggered deep scan

Create a more complicated flow:

```js
const token = process.env.API_TOKEN;

function send(token) {
    console.log(token);

    return fetch("https://example.com", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}
```

Save the file.

Show:

```text
SAVE SCAN COMPLETE

🔴 Secret exposure through logger
🟠 Credential reaches HTTP request
```

Then open the flow graph.

## Demo 3 — Lifecycle tracing

Show graph:

```text
API_TOKEN
   ↓
token
   ↓
send()
   ├── console.log() 🔴
   └── Authorization
          ↓
       fetch() 🟠
```

# 36. Hackathon Demo

The demo should tell a story.

## Demo 1 --- Instant detection

Type:

``` js
const API_KEY = "FAKE_DEMO_SECRET_123456789";
```

Show immediate warning.

------------------------------------------------------------------------

## Demo 2 --- Entropy + context

Show:

``` js
const imageId = "8f92a7d1c8e4...";
```

No high-severity secret warning.

Then:

``` js
const API_KEY = "8f92a7d1c8e4...";
```

Higher confidence.

Explain that the decision uses multiple signals.

------------------------------------------------------------------------

## Demo 3 --- Lifecycle tracing

Write:

``` js
const token = process.env.API_TOKEN;

function send(token) {
    console.log(token);

    return fetch("https://example.com", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}
```

Show graph:

``` text
API_TOKEN
   ↓
token
   ↓
send()
   ├── console.log() 🔴
   └── Authorization
          ↓
       fetch() 🟠
```

------------------------------------------------------------------------

## Demo 4 --- Backend-to-frontend exposure

Show:

``` js
app.get("/profile", (req, res) => {
    const token = process.env.TOKEN;

    res.json({
        token
    });
});
```

Highlight:

``` text
Secret source
     ↓
Backend variable
     ↓
HTTP response
     ↓
Frontend/client
     ↓
🔴 Potential exposure
```

------------------------------------------------------------------------

## Demo 5 --- Auto-remediation

Start with:

``` js
const API_KEY = "FAKE_SECRET";
```

Click:

``` text
Fix Automatically
```

Result:

``` js
const API_KEY = process.env.API_KEY;
```

Then show `.gitignore` verification.

------------------------------------------------------------------------

# 37. What NOT to Claim

Do not claim:

-   "We are the first secret scanner."
-   "Existing scanners only work online."
-   "We detect every possible secret."
-   "We perfectly trace every secret."
-   "AI guarantees security."
-   "Our risk score proves a vulnerability."
-   "Every HTTP transmission of a secret is malicious."

Instead say:

> "We provide local, IDE-native, multi-signal secret detection and
> probable secret-flow analysis."

And:

> "The flow engine reports confidence and uncertainty rather than
> pretending static analysis is perfect."

------------------------------------------------------------------------

# 38. Competitive Positioning

Existing secret scanners are strong at repository and credential
discovery.

The project's focus should be the combination of:

``` text
Live IDE detection
        +
Entropy
        +
Contextual analysis
        +
Local-first processing
        +
Secret lifecycle tracing
        +
Dangerous sink detection
        +
Explainable findings
        +
Developer remediation
```

The differentiating question is:

> "Not only: Where is the secret?"

but:

> "Where did it come from, how did it travel through the application,
> and where might it cross an unsafe boundary?"

------------------------------------------------------------------------

# 39. Future Features

After MVP:

-   Python support
-   Java support
-   Go support
-   Java/Kotlin support
-   more providers
-   secret validity checks
-   dependency-aware analysis
-   Docker/Kubernetes configuration analysis
-   CI integration
-   GitHub integration
-   pull-request analysis
-   runtime tracing
-   taint analysis
-   custom organization rules
-   SARIF export
-   team policy files
-   security reports

------------------------------------------------------------------------

# 40. Final Product Definition

Project name:

## Loyal Knight

Tagline:

> **Detect the secret. Trace the secret. Stop the leak.**

One-line description:

> Loyal Knight is a local-first VS Code security extension that detects API keys and
> credentials using pattern, entropy, and contextual analysis, then
> traces probable secret flows through application code to identify
> unsafe exposure through logs, HTTP responses, errors, telemetry, and
> other sinks.

Core pipeline:

``` text
                    CODE
                      ↓
              Secret Detection
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
     Pattern       Entropy       Context
        └─────────────┼─────────────┘
                      ↓
                 Risk Engine
                      ↓
                Secret Source
                      ↓
                Data Flow Graph
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
      Logs         Network       Frontend
        ↓             ↓             ↓
       Risk          Risk          Risk
        └─────────────┼─────────────┘
                      ↓
             Explain + Remediate
```

The most important engineering rule is:

**Build a reliable MVP first.**

Start with JavaScript/TypeScript, local detection, entropy, contextual
analysis, diagnostics, and a small data-flow engine. Then add sinks,
graph visualization, remediation, Git integration, and runtime-assisted
analysis.

Do not build the runtime layer first. Do not build an AI chatbot first.
Do not build hundreds of provider rules first.

The hackathon story should be:

**Detect → Understand → Trace → Explain → Fix → Prevent.**
