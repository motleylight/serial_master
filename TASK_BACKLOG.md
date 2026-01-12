# Task Backlog

## Phase 0: Foundation (Testing First)
- [ ] **P0-1 (Project Setup):** 初始化 Rust Workspace，配置 Cargo.toml 依赖 (tokio, serialport, log, anyhow)。
- [ ] **P0-2 (Test Harness):** 编写 Rust 集成测试 (`tests/serial_loopback.rs`)。
    - [ ] 实现 COM8 Writer 和 COM9 Reader 的异步 Task。
    - [ ] 验证 115200 波特率下的数据完整性。
    - [ ] 验证高并发写入时的 Buffer 处理能力。
- [ ] **P0-3 (Backend Scaffold):** 建立 `SerialManager` 结构体，封装 `open`, `close`, `write` 方法，预留 `EventLoop` 通道。

## Phase 1: MVP GUI
- [ ] **P1-1 (Tauri Integration):** 初始化 Tauri v2，配置 React + Vite + Tailwind CSS 环境。
- [ ] **P1-2 (UI Layout):** 使用 Shadcn UI 实现三栏响应式布局 (SideBar, Terminal, CommandPanel)。
- [ ] **P1-3 (IPC Binding):**
    - [ ] Rust 端实现 `get_ports`, `connect`, `disconnect`, `send` 命令。
    - [ ] Rust 端实现 `emit('serial-data')` 事件推送。
    - [ ] 前端实现 IPC 调用封装。
- [ ] **P1-4 (Log Terminal):**
    - [ ] 集成 `react-window` 实现虚拟滚动。
    - [ ] 实现 Hex/ASCII 视图切换逻辑。
    - [ ] 实现 `Auto-Scroll` 暂停/恢复逻辑。
- [ ] **P1-5 (Profile Manager):**
    - [ ] 定义 JSON Schema。
    - [ ] 实现前端指令集列表的增删改查 UI。
    - [ ] Rust 端实现 `save_profile` 和 `load_profile` (文件系统操作)。

## Phase 2: Scripting (RustPython)
- [ ] **P2-1 (Engine Embed):** 集成 `rustpython-vm`，并在 Rust 中跑通 "Hello World"。
- [ ] **P2-2 (Hook Architecture):**
    - [ ] 在 `SerialManager` 发送流程中插入 `pre_send_hook` 切面。
    - [ ] 定义 Python 上下文对象 (Context)，注入 `data` 变量。
- [ ] **P2-3 (UI Extension):**
    - [ ] 在 Profile 数据结构中增加 `hook_script` 字段。
    - [ ] 开发 Script Editor 弹窗组件。
- [ ] **P2-4 (Error Handling):** 捕获 Python 脚本异常并将其作为 System Log 推送到前端终端。

## Phase 3: CLI
- [ ] **P3-1 (Core Refactor):** 剥离 Tauri 依赖，确保 `core::SerialManager` 可在非 UI 环境运行。
- [ ] **P3-2 (Clap Integration):** 定义 CLI 参数 (`--port`, `--baud`, `--file`, `--cmd`)。
- [ ] **P3-3 (Headless Runner):** 实现 CLI 模式下的 Profile 加载与顺序执行逻辑。
- [ ] **P3-4 (Exit Codes):** 将 Python 脚本的返回值映射为进程退出码。