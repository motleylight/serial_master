# 实施计划 - 增强型串口大师功能

本计划涵盖了标准串口调试工具中缺失功能的实现。

## 用户审查要求

> [!IMPORTANT]
> **破坏性更改**: 后端的 `connect` 和 `send` 命令将进行更新。`connect` 将需要一个完整的配置对象，`send` 将接受字节数组 (`Vec<u8>`) 而不是字符串，以支持原始二进制/十六进制传输。

## 提议的更改

### 后端 (Rust)

#### [MODIFY] [serial_manager.rs](file:///d:/SerialMaster/src/core/serial_manager.rs)
- 更新 `open` 方法以接受配置结构体 (Baud, DataBits, StopBits, Parity, FlowControl)，而不仅仅是波特率。
- 使用 `serialport` 构建器方法应用这些设置。

#### [MODIFY] [src/tauri/src/commands.rs](file:///d:/SerialMaster/src/tauri/src/commands.rs)
- 定义派生自 `serde::Deserialize` 的 `SerialConfig` 结构体。
- 更新 `connect` 命令以接受 `SerialConfig`。
- 更新 `send` 命令以接受 `Vec<u8>` (有效负载) 而不是字符串。

#### [MODIFY] [src/tauri/src/lib.rs](file:///d:/SerialMaster/src/tauri/src/lib.rs)
- (检查是否需要更新导出的内容，如果在 commands 中包含逻辑，则可能不需要)。

### 前端 (React/TypeScript)

#### [MODIFY] [src/ui/src/services/ipc.ts](file:///d:/SerialMaster/src/ui/src/services/ipc.ts)
- 更新 `connect` 以接受 `SerialConfig` 对象。
- 更新 `send` 以接受 `Uint8Array` 或 `number[]`。

#### [NEW] [src/ui/src/components/SettingsPanel.tsx](file:///d:/SerialMaster/src/ui/src/components/SettingsPanel.tsx)
- 创建用于端口、波特率、数据位、停止位、奇偶校验、流控制的配置面板。

#### [MODIFY] [src/ui/src/App.tsx](file:///d:/SerialMaster/src/ui/src/App.tsx)
- 集成 `SettingsPanel`。
- 添加串口配置的状态。
- 添加 UI 切换状态: `hexDisplay`, `hexSend`, `addTimestamp`, `appendNewline`。
- 实现 `CommandManager` 逻辑 (存储命令列表)。

#### [MODIFY] [src/ui/src/components/Terminal/TerminalContainer.tsx](file:///d:/SerialMaster/src/ui/src/components/Terminal/TerminalContainer.tsx)
- 支持 `hexDisplay` 属性以将数据渲染为 HEX 字符串。
- 支持 `addTimestamp` 属性 (或验证现有逻辑)。

#### [NEW] [src/ui/src/components/CommandManager.tsx](file:///d:/SerialMaster/src/ui/src/components/CommandManager.tsx)
- 用于列出已保存命令的 UI。
- "添加", "编辑", "删除" 按钮。
- "导入", "导出" 功能 (JSON 文件)。
- 每个命令的 "发送" 按钮。

#### [MODIFY] [src/ui/src/components/InputArea.tsx](file:///d:/SerialMaster/src/ui/src/components/InputArea.tsx) (或 App.tsx 中的等效项)
- 添加历史记录支持 (上/下箭头)。
- 处理 "Hex 发送" 逻辑 (将 hex 字符串解析为字节)。
- 处理 "追加换行符" 逻辑。

## 验证计划

### 自动化测试
- GUI 目前没有现成的自动化测试。

### 手动验证
1.  **串口设置**:
    - 连接到虚拟串口对 (例如 com0com，如果可用，或者直接使用真实硬件/com8-com9 loopback)。
    - 验证更改波特率是否有效 (如果可能，通过回环测试检查)。
2.  **Hex 发送/接收**:
    - 启用 "Hex 显示"。接收已知数据。验证其显示为 `XX XX`。
    - 启用 "Hex 发送"。输入 `AA BB`。验证后端接收到 `[0xAA, 0xBB]`。
3.  **命令管理器**:
    - 创建一个命令。
    - 导出到文件。
    - 删除命令。
    - 从文件导入。
    - 验证命令已恢复。
4.  **历史记录**:
    - 输入 A, 发送。输入 B, 发送。
    - 按上 -> B。按上 -> A。按下 -> B。
