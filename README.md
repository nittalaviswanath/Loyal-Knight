# 🛡️ Loyal Knight

**Loyal Knight** is a powerful, locally-running VS Code extension designed for **API Leak & Secret Lifecycle Security**. It acts as your personal guardian, ensuring that sensitive data such as API keys, tokens, and passwords are never accidentally hardcoded or committed to your repositories.

## 🚀 Features

Loyal Knight provides comprehensive, real-time protection directly within your IDE:

- **⚡ Real-time Live Scanning**: Scans your active buffers as you type to instantly detect potential secrets.
- **💾 Scan on Save**: Performs dedicated security and data-flow analysis every time a file is saved.
- **🐙 Git Pre-commit Protection**: Scans staged changes to prevent secrets from ever reaching your repository.
- **📊 Security Dashboard**: A centralized, simplified view of all detected vulnerabilities and the overall security posture of your workspace.
- **🔍 Advanced Secret Detection**: Uses advanced pattern matching and fast Shannon entropy analysis to detect even obfuscated secrets.
- **🧠 Context-Aware Recognition**: Uses context clues (e.g., variable assignments, test files) to adjust finding confidence and reduce false positives.
- **🛠️ Auto-Remediation**: Offers one-click solutions to safely extract hardcoded secrets into environment variables or secure storage.
- **🌊 Data Flow Analysis**: Tracks how secrets move through your application to understand the lifecycle of sensitive data.

## 📦 Installation

To install Loyal Knight in VS Code:
1. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Search for `Loyal Knight`.
3. Click **Install**.

*Note: As this is a local development version, you can also run it by opening this repository in VS Code and pressing `F5`.*

## ⚙️ Configuration

You can customize Loyal Knight's behavior via VS Code Settings (`Ctrl+,` or `Cmd+,`):

| Setting | Type | Default | Description |
|---|---|---|---|
| `loyalKnight.enabled` | Boolean | `true` | Master switch to enable or disable the extension. |
| `loyalKnight.liveScan.enabled` | Boolean | `true` | Enable real-time buffer scanning as you type. |
| `loyalKnight.scanOnSave.enabled` | Boolean | `true` | Enable security and data-flow scan every time a file is saved. |

By default, files like `package.json` and `package-lock.json` are automatically ignored to prevent false positives during entropy scanning.

## 🎮 Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- `Loyal Knight: Toggle Protection`: Quickly enable or disable the extension.
- `Loyal Knight: Scan Current File`: Run an on-demand scan on the currently active file.
- `Loyal Knight: Scan Workspace`: Run a comprehensive scan across the entire workspace.
- `Loyal Knight: Scan Staged Changes`: Check your git staging area for potential leaks before committing.
- `Loyal Knight: Show Security Dashboard`: Open the central security dashboard.
- `Loyal Knight: Show Secret Flow`: Visualize how detected secrets flow through your code.
- `Loyal Knight: Auto Remediate Secret`: Apply automatic fixes for highlighted secrets.
- `Loyal Knight: Open Settings`: Quickly jump to the extension's configuration.
- `Loyal Knight: Refresh Dashboard`: Refresh the Security Dashboard views.

## 🏗️ Architecture

The codebase is organized into several key modules:

- `src/detectors/`: Contains logic for identifying secrets using regex patterns, fast entropy analysis, and context recognition.
- `src/scanner/`: Manages file, buffer, and workspace scanning workflows.
- `src/analysis/`: Analyzes the flow of sensitive data through the Abstract Syntax Tree (AST).
- `src/remediation/`: Provides logic for automatically fixing hardcoded secrets.
- `src/commands/`: Command palette handlers and integrations.
- `src/config/`: Configuration parsing and default ignore management (e.g., `package.json` blacklisting).
- `src/git/`: Handles integration with Git to analyze staged files.
- `src/views/` & `src/ui/`: Implement the simplified Security Dashboard and other UI elements.
- `src/diagnostics/`: Integrates with VS Code's problem matcher to highlight issues directly in the editor.

## 🤝 Contributing

We welcome contributions! To get started:

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Open the project in VS Code.
4. Press `F5` to compile and launch a new Extension Development Host window.
5. Run tests using `npm run test:unit`.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
