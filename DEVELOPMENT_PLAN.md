# Development Roadmap

## Phase 0: 基础设施与测试回路搭建 (Infrastructure & Testbed)
**目标:** 验证技术可行性，建立自动化测试信心。
**环境:** Local PC (COM8 <-> COM9 虚拟互传)。
* 搭建 Rust + Tauri 项目骨架。
* 集成 `serialport-rs` 和 `tokio`。
* **关键交付物:** 一个 Rust 集成测试套件。该套件自动打开 COM8 和 COM9，从 COM8 发数据，验证 COM9 是否收到，且数据无损。

## Phase 1: MVP 交付 (Basic Functionality & GUI)
**目标:** 可用的图形化串口调试工具，替代现有简陋工具。
* **UI 实现:** 基于 React + Shadcn UI 的三栏布局（设置/终端/指令集）。
* **核心功能:** * 串口参数设置与连接/断开。
    * Hex/ASCII 混合收发与显示。
    * 高性能日志终端 (Virtual List)。
    * Profile (指令集) 的 CRUD (增删改查) 及本地 JSON 持久化。
* **限制:** 暂无脚本 Hook，暂无 CLI。

## Phase 2: 可编程能力注入 (Scripting System)
**目标:** 解锁 Hook 系统，支持动态逻辑。
* **引擎集成:** 引入 `RustPython` crate。
* **Hook 实现:**
    * UI 增加脚本编辑器（Monaco Editor 简化版）。
    * 实现 Rust 数据流与 Python VM 的互操作。
* **交付功能:** Pre-send (发送前修改) 和 Post-send (发送后处理) Hook。

## Phase 3: 自动化与无头模式 (Automation & CLI)
**目标:** 工程化与 CI/CD 集成。
* **重构:** 将核心业务逻辑抽离为独立 Library，解耦 Tauri 依赖。
* **CLI 工具:** 实现 `serial-master run -f profile.json`。
* **Rx Hook:** 实现接收数据流的高级过滤与自动化测试断言。