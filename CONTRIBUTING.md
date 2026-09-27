# Contributing to Pixi Code

Thank you for your interest in contributing to Pixi Code! This document provides guidelines for contributing to this VS
Code extension that integrates Pixi environments with the Python Environments extension.

## Development setup

1. **Prerequisites**
    - Node.js 20+
    - VS Code with the Python Environments extension installed
    - [Pixi](https://pixi.prefix.dev/latest/installation/) installed on your system

2. **Clone and setup**

    ```bash
    git clone https://github.com/renan-r-santos/pixi-code.git
    cd pixi-code
    npm install
    ```

3. **Development workflow**

    ```bash
    npm run watch         # Rebuild while you edit
    npm test              # Run the full validation suite before submitting
    ```

    Press `F5` in VS Code to launch an Extension Development Host, then open a project containing `pixi.toml` or a
    `pyproject.toml` with a `[tool.pixi]` table.

## Code style and quality

This project uses TypeScript, ESLint, and Prettier. `npm test` runs the required checks before its unit and extension
tests. Husky formats and fixes staged files at commit time.

### Tests

Use unit tests for pure TypeScript logic, such as Pixi command construction and parsing. They run directly in Node.js and
must not import the `vscode` runtime module.

Use VS Code extension-host tests for interactions with the `vscode` API, extension activation, and extension
contributions. The first run downloads an isolated VS Code instance into `.vscode-test/`; later runs reuse it.

For focused work, run `npm run test:unit` or `npm run test:vscode` individually. `npm run typecheck` is available when
you only need TypeScript validation.

The CI `test` job runs `npm test` before either pre-release publishing job is allowed to start.

## Making a contribution

### 1. Fork and branch

Fork the repository and create a feature branch:

```bash
git checkout -b feature/your-feature-name
```

### 2. Development guidelines

- **Follow existing patterns**: Study the codebase structure and maintain consistency
- **TypeScript strict mode**: Leverage strong typing throughout
- **Import organization**: ESLint automatically sorts and organizes imports
- **Code formatting**: Use Prettier to format your code
- **Logging**: Use the provided logging utilities in `src/common/logging.ts`

### 3. Commit and submit

- Reference any related issues
- Submit a pull request with detailed description
