# Contributing to daan

Thank you so much for considering contributing to the daan project! We welcome contributions of all kinds, whether it's reporting bugs, submitting feature requests, or contributing code directly.

To ensure a smooth process, please take a moment to read the following guidelines.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Setting Up the Development Environment](#setting-up-the-development-environment)
- [Running the Project](#running-the-project)
  - [Running the Web Version (Development Mode)](#running-the-web-version-development-mode)
  - [Running the Desktop Version (Development Mode)](#running-the-desktop-version-development-mode)
- [Building the Project](#building-the-project)
  - [Building the Web Version](#building-the-web-version)
  - [Building the Desktop Version](#building-the-desktop-version)
- [Running Tests and Checks](#running-tests-and-checks)
- [Code Formatting](#code-formatting)
- [Submitting Changes](#submitting-changes)

## Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code. Please make sure to read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) (if it exists, otherwise consider adding one).

## Prerequisites

Before you begin, please ensure you have the following tools installed on your development machine:

1. **Git:** For version control.
2. **Node.js:** Version `>=22.0.0` is required. We recommend using a version manager like [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage Node.js versions.
3. **pnpm:** Version `>=9.0.0` is required. This is the package manager used for the project. If you don't have it installed, you can install it via npm:

   ```bash
   npm install -g pnpm
   ```

   Alternatively, refer to the [official pnpm installation guide](https://pnpm.io/installation).

4. **Rust:** Since this project uses Tauri (`@tauri-apps/cli` is in devDependencies) to build the desktop application, you need the Rust development environment. The easiest way to install it is via [rustup](https://rustup.rs/):

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf [https://sh.rustup.rs](https://sh.rustup.rs) | sh
   ```

   Depending on your operating system, you might also need to install additional system dependencies (like a C compiler, WebView2, etc.). Please consult the [Tauri Guide - Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites) and follow the setup instructions for your platform carefully.

## Setting Up the Development Environment

1. **Clone the repository:**

   ```bash
   git clone git://[github.com/pluveto/daan.git](https://github.com/pluveto/daan.git)
   cd daan
   ```

2. **Install dependencies:**
   Use `pnpm` to install the project's dependencies.

   ```bash
   pnpm install
   ```

   _Note: The `preinstall` script attempts to configure the Git hooks path._

## Running the Project

The project includes a web version and a desktop version built with Tauri.

### Running the Web Version (Development Mode)

This command starts the Vite development server with Hot Module Replacement (HMR).

```bash
pnpm run dev:web
```

Then open the local address provided by Vite in your browser (usually something like `http://localhost:5173`).

### Running the Desktop Version (Development Mode)

This command launches the development version of the desktop application using Tauri.

```bash
pnpm run dev:desktop
```

This will compile the Rust backend (if necessary) and open a native desktop window containing the web frontend.

NOTE: you should have the Rust >= 1.81.0 installed on your machine for the desktop version to work. To install and enable for this project, run the following command:

```bash
rustup install 1.81.0
rustup override set 1.81.0
```

## Building the Project

### Building the Web Version

This command builds the web frontend for production using Vite.

```bash
pnpm run build:web
```

The build artifacts are typically located in the `dist` directory.

### Building the Desktop Version

This command builds the production-ready desktop application installer (e.g., `.exe`, `.dmg`, `.deb`) using Tauri.

```bash
pnpm run build:desktop
```

The build artifacts are usually found in the `src-tauri/target/release/bundle/` directory, depending on your operating system.

## Running Tests and Checks

The project includes type checking (TypeScript), unit/integration tests (Vitest), and code format checks (Prettier). To run all checks:

```bash
pnpm test
```

You can also run them individually:

- **TypeScript Type Check:**

  ```bash
  pnpm run tsc:check
  ```

- **Vitest Tests:**

  ```bash
  pnpm run vitest:run
  ```

- **Format Check:**

  ```bash
  pnpm run lint:format
  ```

## Code Formatting

The project uses Prettier for code formatting, integrated with a Tailwind CSS plugin.

- **Automatically format all supported files:**

  ```bash
  pnpm run format
  ```

- **Check if files adhere to formatting standards (without modifying them):**

  ```bash
  pnpm run lint:format
  ```

It's recommended to run `pnpm run format` before committing your changes.

## Submitting Changes

1. Create a new feature branch from `main` or the latest development branch (`git checkout -b my-feature-branch`).
2. Make your code changes.
3. Ensure `pnpm test` and `pnpm run format` pass successfully.
4. Commit your changes (`git commit -m "feat: Describe your feature"`). Use a meaningful commit message.
5. Push your branch to GitHub (`git push origin my-feature-branch`).
6. Open a Pull Request on the GitHub repository page, describing your changes.

Thank you for your contribution!

## Troubleshooting

### (Windows) Error: listen EACCES: permission denied 127.0.0.1:5173

Make sure 5172 is not in the excluded port range

```bat
net stop winnat
net start winnat
netsh interface ipv4 show excludedportrange protocol=tcp
```
