<div align="center">
  <h1>🛡️ Loyal Knight</h1>
  <p><strong>Advanced Local API Leak & Secret Lifecycle Security for VS Code</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blueviolet.svg)](https://marketplace.visualstudio.com/items?itemName=singularity-dudes.loyal-knight)
</div>

---

**Loyal Knight** is an enterprise-grade, locally-running Visual Studio Code extension engineered to prevent API leaks and manage the secret lifecycle seamlessly. It acts as your personal data guardian, ensuring that sensitive credentials—like API keys, tokens, and passwords—are never accidentally hardcoded in your source files or committed to your repositories.

Because Loyal Knight runs **fully locally and offline**, you get real-time security analysis without any of your source code or secrets ever leaving your machine. This guarantees absolute privacy, lightning-fast performance, and zero dependency on external cloud services.

<div align="center">
  <img src="media/dashboard.png" alt="Loyal Knight Security Dashboard" width="420" />
  <p><em>The Loyal Knight Security Dashboard providing real-time insights into workspace vulnerabilities.</em></p>
</div>

## 📖 Deep Dive: How Loyal Knight Works

In modern development workflows, a single leaked API key can result in catastrophic security breaches and massive financial losses. Loyal Knight goes far beyond traditional, noisy regex-based secret scanners by employing a multi-layered detection engine directly within your IDE:

1. **Intelligent Pattern Matching & Entropy Analysis:** Loyal Knight uses high-speed regex combined with fast **Shannon Entropy analysis** to uncover highly randomized strings, identifying potential secrets even if they don't match standard vendor patterns.
2. **Context-Aware Confidence Scoring:** Not all high-entropy strings are secrets. The extension analyzes surrounding context (like variable names, assignments, and test files) to adjust confidence levels and drastically reduce false positives.
3. **AST Data Flow Analysis:** It doesn't just look at strings; it understands your code. By parsing the Abstract Syntax Tree (AST), Loyal Knight tracks how sensitive data flows through your application, identifying if a secret is dangerously passed into an insecure sink (like `console.log` or a plaintext HTTP request).
4. **High-Performance Whole Project Indexing:** With its advanced file indexing system, Loyal Knight scans your entire project lightning-fast. It caches previously scanned files and only re-evaluates files that have been modified, ensuring zero impact on your development velocity.
5. **Strict Blacklist Enforcement:** It natively understands project structures, automatically ignoring irrelevant directories (`node_modules`, `.git`, build outputs) and strictly respecting your `.gitignore` rules.

---

## 🚀 Key Features

- **100% Local & Offline Execution:** All scanning and analysis happens directly on your machine. No internet connection is required, and your code never leaves your IDE.
- **Real-Time Live Scanning:** Monitors your active buffers as you type to instantly detect potential secrets before you even hit save, entirely locally.
- **Scan on Save:** Performs dedicated security and data-flow analysis every time a file is saved.
- **Git Pre-commit Protection:** Scans staged changes to guarantee that secrets never make it into your git history.
- **Centralized Security Dashboard:** A unified, sleek view of all detected vulnerabilities, categorized by severity (High, Medium, Low), and the overall security posture of your workspace.
- **One-Click Auto-Remediation:** Offers smart, automated solutions to safely extract hardcoded secrets and move them into environment variables (`.env`) or secure storage.
- **Secret Data Flow Visualization:** Visually track the lifecycle of sensitive data as it moves from source to sink across your codebase.

---

## 📦 Installation

To install Loyal Knight in VS Code:

1. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X` on Mac).
2. Search for `Loyal Knight`.
3. Click **Install**.

_Note: For local development, you can clone this repository, open it in VS Code, and press `F5` to launch a new Extension Development Host._

---

## ⚙️ Configuration

Customize Loyal Knight to fit your workflow perfectly via VS Code Settings (`Ctrl+,` or `Cmd+,`):

| Setting                          | Type      | Default | Description                                                           |
| :------------------------------- | :-------- | :------ | :-------------------------------------------------------------------- |
| `loyalKnight.enabled`            | `Boolean` | `true`  | Master switch to enable or disable the extension globally.            |
| `loyalKnight.liveScan.enabled`   | `Boolean` | `true`  | Enable real-time buffer scanning as you type.                         |
| `loyalKnight.scanOnSave.enabled` | `Boolean` | `true`  | Enable comprehensive security and data-flow scans upon saving a file. |

_Files ignored by `.gitignore` and massive directories like `node_modules` are automatically skipped for optimal performance._

---

## 🎮 Command Palette Integration

Access the following commands via the VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- `Loyal Knight: Toggle Protection` — Quickly enable or disable active protection.
- `Loyal Knight: Scan Current File` — Run an on-demand scan on the currently active editor.
- `Loyal Knight: Scan Workspace` — Run a comprehensive, indexed scan across the entire project.
- `Loyal Knight: Scan Staged Changes` — Check your git staging area for potential leaks.
- `Loyal Knight: Show Security Dashboard` — Open the central security analytics dashboard.
- `Loyal Knight: Show Secret Flow` — Visualize how detected secrets flow through your code.
- `Loyal Knight: Auto Remediate Secret` — Apply automatic fixes for highlighted secrets.
- `Loyal Knight: Open Settings` — Quickly jump to the extension's configuration.

---

## 🏗️ Architecture Overview

The codebase is highly modular, designed for extensibility and performance:

- **`src/detectors/`**: The core detection engine utilizing regex, fast entropy analysis, and context recognition.
- **`src/scanner/`**: Orchestrates high-performance file indexing, buffer scanning, and whole-workspace traversals.
- **`src/analysis/`**: Contains the logic for AST (Abstract Syntax Tree) data flow tracking.
- **`src/remediation/`**: Automated logic for refactoring hardcoded secrets to secure locations.
- **`src/git/`**: Pre-commit hooks and git staging area integrations.
- **`src/views/` & `src/ui/`**: Webview implementations for the sleek Security Dashboard.

---

## 🤝 Contributing

We welcome contributions! To get started:

1. Clone the repository: `git clone https://github.com/nittalaviswanath/Loyal-Knight.git`
2. Run `npm install` to install dependencies.
3. Open the project in VS Code.
4. Press `F5` to compile and launch a new Extension Development Host window.
5. Run tests using `npm run test:unit`.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
