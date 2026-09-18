# Loyal Knight - Enhancement & Fix Plan

## 1. Performance & Scanning Efficiency (File Indexing)

- **Issue:** Checking each file is currently too slow.
- **Fix/Instruction:** Implement **File Indexing** to ensure files that have already been scanned are not scanned again until updates are made to them.
  - Track file modification timestamps (e.g., using `fs.stat`) or use file hashing.
  - Maintain a cache of previously scanned files and their last known state.
  - During a scan, skip files whose state has not changed since the last successful scan.

## 2. Whole Project Scanning

- **Issue:** The extension currently only checks for API keys in the currently open file.
- **Fix/Instruction:** Expand the scanning mechanism to check the **whole project**.
  - Recursively traverse the workspace directory to scan all files.
  - Integrate this closely with the File Indexing system to ensure whole-project scans are performant.

## 3. Blacklist Enforcement & Whitelist Removal

- **Instruction:**
  - **Remove the Whitelist feature** entirely from the codebase (UI, logic, and configurations).
  - **Enforce the Blacklist:** Ensure the whole project scan strictly respects the blacklist. It must ignore irrelevant or massive directories (e.g., `node_modules`, `.git`, build outputs) and respect `.gitignore` configurations by default.
  <!--

<!-- ## 4. Detection Logic Issues (To Be Addressed)

### Data Flow & AST Analysis Limitations

- **Rigid Sink Detection**: The HTTP and Logger sink detection matches exact simple text strings (e.g., `console.log`, `fetch`). It fails to detect variants like `window.fetch`, `global.fetch`, `console.table`, `console.dir`, or other obscure variants of console logging.
- **Limited Function Parameter Tracking**: Parameter tracking works for functions defined in the same file but does not track arguments passed to imported functions beyond the hardcoded sinks.

### Pattern Matching Limitations

- **Unsupported Template Literals**: The generic secret assignment and AWS secret key rules only check for single (`'`) and double (`"`) quotes, missing template literals (backticks).
- **Incomplete Stripe Key Pattern**: The Stripe publishable key pattern only detects `pk_live_`. It doesn't check for test keys (`pk_test_`).

### Entropy & Context Analysis

- **Multi-line Strings Ignored**: The `extractCandidateTokens` only parses token candidates line-by-line. If a high-entropy string spans multiple lines, it will not be properly evaluated for entropy. --> -->
