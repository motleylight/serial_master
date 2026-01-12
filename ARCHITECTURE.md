# SerialMaster Architecture Overview

**Project:** SerialMaster
**Type:** Native Cross-Platform Serial Debugger & Automation Tool
**Tech Stack:** Rust + Tauri v2 + React (Shadcn UI) + Tokio

## 1. 核心设计原则 (Design Principles)
* **Zero-Runtime Dependency:** 编译为单一二进制文件，无外部 Python/Node 环境依赖。
* **Reactive UI:** 采用 Virtual Scrolling 处理高频串口日志，保证 UI 零卡顿。
* **Separation of Concerns:** * **Core (Rust):** 负责所有 I/O、配置读写、脚本执行。
    * **View (React):** 仅负责渲染状态和捕获用户输入，不处理业务逻辑。
* **Test-Driven (Phase 0):** 基于虚拟串口对 (COM8/COM9) 构建全自动化集成测试。

## 2. 模块分层 (Layering)

### Layer 1: Interface
* **GUI:** Tauri WebView (Windows WebView2).
* **CLI (Phase 3):** `clap` based headless runner.

### Layer 2: Core Logic (Rust `lib`)
* **Session Manager:** 管理 `serialport` 实例，维护连接状态。
* **Data Pipeline:** * Raw Bytes -> Pre-Send Hook -> Serial Port
    * Serial Port -> Raw Bytes -> Rx Hook -> Buffer -> IPC Event -> UI
* **Profile Manager:** JSON 序列化/反序列化，处理指令集 CRUD。

### Layer 3: Runtime
* **Async Runtime:** `tokio` (处理并发 I/O)。
* **Script Engine (Phase 2):** `RustPython` (嵌入式 VM)。

## 3. 数据协议 (Data Schema)

**Profile Configuration (`profile.json`)**
用户交换的核心资产，严格剥离环境配置。
```json
{
  "meta": { "name": "Device_Protocol_V1", "version": "1.0.0" },
  "commands": [
    {
      "id": "uuid-v4",
      "name": "Handshake",
      "payload": "AA 55 00 01",
      "is_hex": true,
      "description": "System init command"
    }
  ]
}