# Phase 0 实施计划

## 目标描述
通过设置 Rust 工作区、实现核心 `SerialManager` 后端以及使用虚拟串口 (COM8/COM9) 创建健壮的测试工具，为 SerialMaster 奠定基础。

## 需要用户审查
> [!IMPORTANT]
> 需要激活虚拟 COM 端口对 (COM8 <-> COM9) 以运行集成测试。请确保已配置 `com0com` 或类似工具。

## 建议变更

### 项目设置
#### [NEW] [Cargo.toml](file:///d:/SerialMaster/Cargo.toml)
- 定义工作区或包配置。
- 添加依赖项：`tokio`, `serialport`, `log`, `env_logger`, `anyhow`, `thiserror`。

### 核心后端 (`src/lib.rs` / `src/core/mod.rs`)
#### [NEW] [lib.rs](file:///d:/SerialMaster/src/lib.rs)
- 导出核心模块。

#### [NEW] [serial_manager.rs](file:///d:/SerialMaster/src/core/serial_manager.rs)
- 定义 `SerialManager` 结构体。
- 实现 `open(port_name, baud_rate)`: 返回 `Result<()>`.
- 实现 `write(data)`: 异步写入。
- 实现 `close()`: 清理资源并关闭。
- 实现 `EventLoop` 通道用于异步读取。

### 测试工具
#### [NEW] [serial_loopback.rs](file:///d:/SerialMaster/tests/serial_loopback.rs)
- 使用 `tokio::test` 进行异步集成测试。
- `test_loopback_integrity`: COM9 读取，COM8 写入。发送模式数据并验证。
- `test_concurrent_writes`: 压力测试缓冲处理。

## 验证计划

### 自动化测试
运行新创建的集成测试：
```bash
cargo test --test serial_loopback
```
