# SerialMaster

A modern, extensible, cross-platform serial debugging assistant built with Tauri and Rust.

[中文文档 (Chinese)](README.md)

## ✨ Key Features

*   **⚡ High Performance**: Built on Tauri & Rust, ultra-lightweight (~8MB release) and fast.
*   **🔍 Regex Filter & Replacement**: 
    *   Real-time regex filtering of log data without affecting performance.
    *   **Context View**: Show surrounding lines for each match with auto-inserted separators.
    *   **Live Replacement**: Rewrite log display using regex capture groups (e.g., replace `Temp=(\d+)` with `T: $1`).
*   **🐍 Python Scripting**: Embedded **RustPython** engine. Write Python scripts to intercept and process data (Pre-send, Post-send, Rx-hook) without external dependencies.
*   **🎨 Modern UI**: Built with React + Tailwind CSS. Supports virtual scrolling for high-performance log display.
*   **🔌 Smart Port Management**: Automatically identifies USB/Bluetooth devices with friendly names.
*   **💾 Command Persistence**: Save and manage your frequently used commands.

## 🛠️ Tech Stack

*   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI
*   **Backend**: Rust, Tauri
*   **Scripting**: RustPython (Embedded Python 3 Interpreter)

## 🚀 Development & Build

### Prerequisites
*   Node.js & npm
*   Rust & Cargo

### Run Locally
```bash
# Install frontend dependencies
cd src/ui
npm install

# Run dev server
npm run dev

# Run Tauri app (in a new terminal)
# Go back to root
npx @tauri-apps/cli dev
```

### Build Release
```bash
npm install -g @tauri-apps/cli
cargo tauri build
# OR
npx @tauri-apps/cli build
```
The output installer will be in `target/release/bundle/nsis/`.

## 📄 License

MIT
