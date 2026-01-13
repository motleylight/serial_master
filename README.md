# SerialMaster (串口大师)

A modern, extensible, cross-platform serial debugging assistant built with Tauri and Rust.
基于 Tauri 和 Rust 构建的现代化、可扩展、跨平台串口调试助手。

## ✨ Key Features (核心特性)

*   **⚡ High Performance**: Built on Tauri & Rust, ultra-lightweight (~8MB release) and fast.
    *   **高性能**: 基于 Tauri & Rust，超轻量（发布版约 8MB），启动迅速。
*   **🐍 Python Scripting**: Embedded **RustPython** engine. Write Python scripts to intercept and process data (Pre-send, Post-send, Rx-hook) without external dependencies.
    *   **Python 脚本**: 内置 RustPython 引擎。支持编写 Python 脚本实时处理发送前、发送后及接收到的数据，无需安装 Python 环境。
*   **🎨 Modern UI**: Built with React + Tailwind CSS. Supports virtual scrolling for high-performance log display.
    *   **现代界面**: React + Tailwind CSS 构建。支持虚拟列表技术，流畅显示海量日志。
*   **🔌 Smart Port Management**: Automatically identifies USB/Bluetooth devices with friendly names.
    *   **智能端口管理**: 自动识别并显示 USB/蓝牙设备的完整友好名称。
*   **💾 Command Persistence**: Save and manage your frequently used commands.
    *   **指令管理**: 支持常用指令的保存和快速调用。

## 🛠️ Tech Stack (技术栈)

*   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI
*   **Backend**: Rust, Tauri
*   **Scripting**: RustPython (Embedded Python 3 Interpreter)

## 🚀 Development & Build (开发与构建)

### Prerequisites (前置要求)
*   Node.js & npm
*   Rust & Cargo

### Run Locally (本地运行)
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

### Build Release (构建发布版)
```bash
npm install -g @tauri-apps/cli
cargo tauri build
# OR
npx @tauri-apps/cli build
```
The output installer will be in `target/release/bundle/nsis/`.

## 📄 License

MIT
