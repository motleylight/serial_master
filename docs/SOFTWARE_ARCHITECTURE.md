# SerialUtil 软件架构文档

> **文档版本**: 1.0  
> **更新日期**: 2026-01-17  
> **状态**: 当前版本

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [整体架构](#3-整体架构)
4. [后端接口设计](#4-后端接口设计)
5. [前端模块设计](#5-前端模块设计)
6. [数据流设计](#6-数据流设计)
7. [配置管理](#7-配置管理)

---

## 1. 项目概述

SerialUtil 是一款基于 Tauri 构建的现代串口调试工具，采用 Rust 后端 + React 前端的混合架构。主要功能：

- **串口通信**: 连接、读写串口数据
- **端口共享**: 基于 com0com 虚拟串口驱动，允许多应用共享同一物理串口
- **脚本扩展**: 支持 JavaScript 和外部程序对收发数据进行处理
- **命令管理**: 预设命令的保存和快速发送

---

## 2. 技术栈

### 后端 (Rust)

| 模块 | 技术 |
|------|------|
| 框架 | Tauri 2.9.5 |
| 串口库 | serialport-rs |
| 异步运行时 | Tokio |
| 状态管理 | tokio::sync::Mutex |
| 虚拟串口 | com0com (Windows) |

### 前端 (TypeScript/React)

| 模块 | 技术 |
|------|------|
| UI 框架 | React 18 |
| 构建工具 | Vite |
| 样式 | TailwindCSS |
| 虚拟列表 | react-window |
| 代码编辑器 | Monaco Editor |
| 配置存储 | js-yaml (YAML解析库) + Tauri FS Plugin |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React/TypeScript)                    │
├─────────────────────────────────────────────────────────────────┤
│  App.tsx                                                         │
│  ├── TerminalContainer      终端显示模块                          │
│  ├── ControlPanel           串口配置与输入模块                      │
│  ├── CommandManager         预设命令管理                          │
│  ├── ScriptEditor           脚本编辑器                            │
│  └── PortSharingDialog      端口共享管理                          │
├─────────────────────────────────────────────────────────────────┤
│                        IPC 通信层                                 │
│  ├── SerialService          串口操作封装                          │
│  ├── PortSharingService     端口共享操作封装                       │
│  └── ScriptService          脚本状态管理                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Tauri invoke / listen
┌──────────────────────────────▼──────────────────────────────────┐
│                        后端 (Rust/Tauri)                          │
├─────────────────────────────────────────────────────────────────┤
│  lib.rs (应用入口)                                                │
│  ├── commands.rs            Tauri 命令处理器                       │
│  └── scripting.rs           脚本执行管理                           │
├─────────────────────────────────────────────────────────────────┤
│                        核心模块 (src/core/)                       │
│  ├── serial_manager.rs      串口管理器                            │
│  ├── port_sharing_manager.rs 端口共享状态管理                      │
│  ├── com0com_manager.rs     com0com 驱动封装                      │
│  └── admin_service.rs       管理员权限服务                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 后端接口设计

后端通过 Tauri 的 `#[tauri::command]` 宏暴露接口，前端通过 `invoke()` 调用。

### 4.1 串口管理模块

管理物理串口的连接、数据读写。

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `get_ports` | - | `Vec<PortInfo>` | 获取系统可用串口列表，包含端口名和产品描述 |
| `connect` | `config: SerialConfig` | `()` | 连接指定串口，启动后台读取线程 |
| `disconnect` | - | `()` | 断开当前串口连接 |
| `send` | `content: Vec<u8>` | `()` | 向串口发送数据（会先经过脚本处理） |

**SerialConfig 结构:**

```rust
struct SerialConfig {
    port_name: String,      // 端口名 (如 "COM3")
    baud_rate: u32,         // 波特率 (如 115200)
    data_bits: u8,          // 数据位 (5/6/7/8)
    flow_control: String,   // 流控制 ("None"/"Software"/"Hardware")
    parity: String,         // 校验 ("None"/"Odd"/"Even")
    stop_bits: u8,          // 停止位 (1/2)
    timeout: u64,           // 接收超时（帧分隔）(ms)
}
```

**PortInfo 结构:**

```rust
struct PortInfo {
    port_name: String,           // 端口名
    product_name: Option<String> // 产品描述（设备管理器中的名称）
}
```

**事件:**

| 事件名 | 负载 | 说明 |
|--------|------|------|
| `serial-data` | `Vec<u8>` | 串口接收到数据时触发 |

### 4.2 端口共享模块

基于 com0com 虚拟串口驱动实现端口共享功能。

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `check_com0com_installed` | - | `bool` | 检测 com0com 是否已安装 |
| `get_virtual_pairs` | - | `Vec<PortPair>` | 获取已创建的虚拟端口对列表 |
| `create_virtual_pair` | `name_a, name_b: String` | `PortPair` | 创建新的虚拟端口对 |
| `remove_virtual_pair` | `pair_id: u32` | `()` | 删除指定的虚拟端口对 |
| `rename_virtual_pair` | `pair_id, name_a, name_b` | `()` | 重命名虚拟端口对 |
| `get_sharing_status` | - | `SharingStatus` | 获取当前共享状态 |
| `start_port_sharing` | `physical_port, virtual_pair_ids, baud_rate` | `()` | 启动端口共享 |
| `stop_port_sharing` | - | `()` | 停止端口共享 |

**PortPair 结构:**

```rust
struct PortPair {
    pair_id: u32,     // 端口对 ID
    port_a: String,   // A 端口名 (内部端口，SerialUtil 使用)
    port_b: String,   // B 端口名 (外部端口，第三方应用使用)
}
```

**SharingStatus 结构:**

```rust
struct SharingStatus {
    enabled: bool,                   // 是否启用共享
    port_pairs: Vec<PortPair>,       // 当前使用的虚拟端口对
    physical_port: Option<String>,   // 正在共享的物理端口
}
```

### 4.3 脚本执行模块

支持对发送/接收数据进行处理的脚本功能。

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `set_script` | `script_type, content` | `()` | 设置外部程序脚本 |

**script_type 取值:**

| 后端参数值 | 前端叫法 | 说明 |
|-----------|---------|------|
| `"pre_send"` | TX Hook | 发送前处理脚本 |
| `"rx"` | RX Hook | 接收后处理脚本 |

> **注意**:
> - **JavaScript 脚本**在前端执行（使用 `new Function()`），不经过此后端接口
> - **外部程序脚本**通过此接口配置，后端通过 stdin/stdout 与外部程序交互

---

## 5. 前端模块设计

### 5.1 模块依赖关系

```
App.tsx (主入口)
├── useAppConfig Hook (配置管理)
│   └── config.yaml (持久化存储)
├── ScriptService (脚本状态)
│
├── TerminalContainer (终端模块)
│   ├── LogEntry (日志条目渲染)
│   ├── 虚拟列表 (react-window)
│   ├── 搜索/过滤功能
│   └── 保存/加载日志
│
├── ControlPanel (控制面板)
│   ├── PortSelect (端口选择)
│   ├── HexSwitch (十六进制开关)
│   ├── PortSharingToggle (共享状态指示)
│   └── 输入框 + 发送按钮
│
├── CommandManager (命令管理器侧边栏)
│   └── commands.yaml (命令存储)
│
├── ScriptEditor (脚本编辑器弹窗)
│   └── Monaco Editor
│
└── PortSharingDialog (端口共享管理弹窗)
    ├── 虚拟端口对管理
    └── 拓扑图展示
```

### 5.2 终端模块 (TerminalContainer)

**职责**: 显示串口收发日志，支持多种显示模式和搜索功能。

**关键特性:**

| 特性 | 实现方式 |
|------|----------|
| 高性能渲染 | react-window 虚拟列表，仅渲染可见行 |
| 显示模式 | ASCII / HEX / MIXED 三种模式切换 |
| 搜索功能 | 普通字符串、正则表达式、跨行匹配 |
| 自动滚动 | 手动交互自动关闭，不会自动重新激活 |
| 日志导出 | 保存为文本文件 |
| 日志导入 | 加载历史日志文件 |

**数据类型 (LogData):**

```typescript
interface LogData {
    id: number;                         // 唯一标识
    timestamp: number;                  // 时间戳
    type: 'RX' | 'TX' | 'SYS' | 'ERR';  // 日志类型
    data: Uint8Array | string;          // 数据内容
}
```

**从后端获取的数据:**

- 通过 `serial-data` 事件接收 `Uint8Array` 格式的串口数据

### 5.3 控制面板模块 (ControlPanel)

**职责**: 串口参数配置、连接控制、数据发送。

**UI 区域分解:**

```
┌──────────────────────────────────────────────────────────────────┐
│ [端口选择▼][波特率▼][8N1▼]  [端口共享按钮] [脚本按钮] [连接按钮] │  ← 设置行
├──────────────────────────────────────────────────────────────────┤
│ [HEX] [________________________输入框________________________▼] [发送] │  ← 输入行
└──────────────────────────────────────────────────────────────────┘
```

**从后端获取的数据:**

| 数据 | 接口 | 用途 |
|------|------|------|
| 端口列表 | `get_ports` | 填充端口选择下拉框 |
| 共享状态 | `get_sharing_status` | 更新共享按钮状态 |

**发送到后端的数据:**

| 操作 | 接口 | 数据 |
|------|------|------|
| 连接 | `connect` | SerialConfig |
| 断开 | `disconnect` | - |
| 发送 | `send` | Uint8Array |

### 5.4 命令管理器模块 (CommandManager)

**职责**: 管理预设命令，支持快速发送。

**数据结构:**

```typescript
interface SavedCommand {
    id: string;      // 运行时 ID (仅内存)
    name: string;    // 命令名称
    command: string; // 命令内容
    isHex: boolean;  // 是否为十六进制
}
```

**存储格式 (commands.yaml):**

```yaml
- name: 心跳包
  command: "AA BB CC"
  isHex: true

- name: 查询版本
  command: "AT+VERSION?\r\n"
  isHex: false
```

**功能:**

- 添加/删除/编辑命令
- 导入/导出命令文件
- 单击执行发送

### 5.5 脚本编辑器模块 (ScriptEditor)

**职责**: 配置 TX/RX 数据处理脚本。

**脚本类型:**

| 类型 | 执行位置 | 说明 |
|------|----------|------|
| JavaScript | 前端 (浏览器) | 使用 `new Function()` 执行，可访问 `data` 数组 |
| 外部程序 | 后端 (Rust) | 通过 stdin 接收数据，stdout 返回处理后数据 |

**脚本模板示例:**

**JavaScript 脚本 (前端执行):**

```javascript
// TX Hook: 添加校验和
const sum = data.reduce((a, b) => a + b, 0) & 0xFF;
data.push(sum);

// RX Hook: 过滤非打印字符
const filtered = data.filter(b => b >= 32 && b <= 126);
data.length = 0;
data.push(...filtered);
```

**外部程序脚本 (后端执行):**

在脚本编辑器中选择 "External" 类型，输入命令行：

```
python process_data.py
```

对应的 Python 脚本示例 (`process_data.py`)：

```python
import sys

# 从 stdin 读取二进制数据
data = sys.stdin.buffer.read()

# 处理数据：添加校验和
checksum = sum(data) & 0xFF
result = data + bytes([checksum])

# 输出到 stdout
sys.stdout.buffer.write(result)
```

### 5.6 端口共享模块 (PortSharingDialog)

**职责**: 管理 com0com 虚拟端口对，控制端口共享。

**UI 组成:**

1. **虚拟端口对列表** - 显示已创建的端口对，支持创建/删除/重命名
2. **拓扑图** - 可视化展示数据流向

**拓扑结构:**

```
┌─────────────────────┐                              ┌─────────────────────┐
│   Physical Port     │                              │   3rd Party App     │
│      (COM3)         │                              │                     │
└──────────┬──────────┘                              └──────────┬──────────┘
           │ 占用                                               │ 占用
           ▼                                                    ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│                     │     │      com0com        │     │                     │
│    SerialUtil       │◀───▶│   (虚拟串口驱动)     │◀───▶│   Virtual Port A    │
│                     │     │                     │     │      (COM10)        │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
           │                          │                          │
           │ 占用                     │ 连接                     │
           ▼                          ▼                          │
┌─────────────────────┐     ┌─────────────────────┐              │
│   Physical Port     │     │   Virtual Port B    │◀─────────────┘
│      (COM3)         │     │     (CNCB0)         │
│                     │     │                     │
└─────────────────────┘     └─────────────────────┘
```

**数据流说明:**

- **SerialUtil** 同时打开物理端口 (COM3) 和虚拟端口 B (CNCB0)
- **com0com 驱动** 自动将 Virtual Port A ↔ Virtual Port B 的数据互通
- **第三方应用** 连接 Virtual Port A (COM10)，像连接真实串口一样操作
- **双向透传**: 物理设备 ↔ SerialUtil ↔ 虚拟端口B ↔ 虚拟端口A ↔ 第三方App

**从后端获取的数据:**

| 数据 | 接口 |
|------|------|
| com0com 安装状态 | `check_com0com_installed` |
| 虚拟端口对列表 | `get_virtual_pairs` |
| 共享状态 | `get_sharing_status` |
| 端口列表 (含详情) | `get_ports` |

---

## 6. 数据流设计

### 6.1 串口数据接收流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  物理串口   │───▶│ SerialManager │───▶│ Rx Hook     │───▶│ Tauri Event │
│  (硬件)     │    │ (读取线程)   │    │ (可选)      │    │ serial-data │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
    ┌───────────────────────────────────────────────────────────┘
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ SerialService │──▶│ JS RxHook   │───▶│ Log Buffer  │───▶│ Terminal UI │
│ (前端监听)    │    │ (可选)      │    │ (批量更新)   │    │ (虚拟列表)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**性能优化:**

- 后端使用超时机制进行帧分隔（默认 10ms）
- 前端使用日志缓冲区，按 100ms 批量更新 UI
- 最大日志数 10000 条，超出自动裁剪

### 6.2 串口数据发送流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  用户输入    │───▶│ JS TxHook   │───▶│ invoke send │───▶│ ScriptManager │
│  (前端)      │    │ (可选)      │    │ (IPC)       │    │ pre_send Hook │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
    ┌───────────────────────────────────────────────────────────┘
    ▼
┌─────────────┐    ┌─────────────┐
│ SerialManager │───▶│  物理串口   │
│ (写入)        │    │  (硬件)     │
└─────────────┘    └─────────────┘
```

### 6.3 端口共享数据流

```
                    ┌─────────────────────────────────┐
                    │           SerialUtil             │
                    │                                  │
┌─────────────┐     │  ┌─────────────┐  ┌──────────┐  │     ┌─────────────┐
│  物理串口    │◀───▶│  │ SerialManager │◀▶│ 虚拟端口 │  │◀───▶│  第三方应用   │
│  (COM3)     │     │  │  (数据桥接)   │  │ (CNCBx) │  │     │ (连接 COMx) │
└─────────────┘     │  └─────────────┘  └──────────┘  │     └─────────────┘
                    │          │                       │
                    │          ▼                       │
                    │   ┌─────────────┐                │
                    │   │  Terminal UI │               │
                    │   │  (显示数据)   │               │
                    │   └─────────────┘                │
                    └─────────────────────────────────┘
```

**特点:**

- 双向透明桥接：物理端口 ↔ 虚拟端口
- SerialUtil 自身可同时收发数据（Spy 模式）
- 第三方应用无需修改即可使用虚拟端口

---

## 7. 配置管理

### 7.1 配置文件结构 (config.yaml)

```yaml
# 串口配置
serial:
  port_name: "COM3"
  baud_rate: 115200
  data_bits: 8
  stop_bits: 1
  parity: "None"
  flow_control: "None"
  timeout: 10

# 终端配置
terminal:
  hexMode: false      # 是否以十六进制显示
  autoScroll: true    # 自动滚动
  wordWrap: false     # 自动换行

# 发送配置
send:
  hexMode: false              # 是否发送十六进制
  appendMode: "None"          # 追加换行符 ("None"/"CR"/"LF"/"CRLF")

# UI 配置
ui:
  sidebarVisible: true        # 侧边栏可见
  sidebarWidth: 288           # 侧边栏宽度
  showTimestamp: true         # 显示时间戳
  inputDraft: ""              # 输入框草稿
  inputHistory: []            # 输入历史

# 文件路径
files:
  commands: "commands.yaml"   # 命令文件路径

# 脚本配置
scripts:
  tx:
    type: null                # "js" | "external" | null
    content: ""
  rx:
    type: null
    content: ""
```

### 7.2 配置同步机制

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  UI 组件     │◀──▶│ useAppConfig │◀──▶│ config.yaml │
│  (React)    │    │   (Hook)     │    │  (文件系统)  │
└─────────────┘    └─────────────┘    └─────────────┘
      │                  │
      │                  │ 1000ms 防抖
      ▼                  ▼
┌─────────────┐    ┌─────────────┐
│ ScriptService │◀──│ 脚本同步     │
│  (单例)       │    │             │
└─────────────┘    └─────────────┘
```

**特点:**

- 配置变更自动保存（防抖 1 秒）
- 应用启动时自动加载
- 脚本配置同步到 ScriptService 并通知后端

---

## 附录

### A. 文件结构概览

```
src/
├── core/                       # Rust 核心模块
│   ├── serial_manager.rs       # 串口管理
│   ├── port_sharing_manager.rs # 共享状态管理
│   ├── com0com_manager.rs      # com0com 驱动封装
│   ├── admin_service.rs        # 管理员服务
│   └── ipc.rs                  # IPC 类型定义
│
├── tauri/src/                  # Tauri 应用层
│   ├── lib.rs                  # 应用入口 + 事件循环
│   ├── commands.rs             # Tauri 命令处理器
│   └── scripting.rs            # 脚本执行管理
│
└── ui/src/                     # 前端代码
    ├── App.tsx                 # 主入口
    ├── components/             # UI 组件
    │   ├── Terminal/           # 终端相关
    │   ├── ControlPanel.tsx    # 控制面板
    │   ├── CommandManager.tsx  # 命令管理器
    │   ├── ScriptEditor.tsx    # 脚本编辑器
    │   └── PortSharingDialog.tsx # 端口共享
    │   └── services/               # 服务层
    │   ├── ipc.ts              # Tauri IPC 封装
    │   └── ScriptService.ts    # 脚本服务
    └── hooks/                  # React Hooks
        └── useAppConfig.ts     # 配置管理
```

### B. 相关文档

- [用户指南](USER_GUIDE.md) ===这个文档也是完全过时的，无参考价值，你根据对代码的理解重写吧===
- [脚本开发指南](SCRIPTING_GUIDE.md) ===这个脚本开发指南已经过时了，现在已经不支持python内嵌了，请根据你的代码阅读结果重写这个指南===
- [端口共享设计](PORT_SHARING_DESIGN.md) ===这个文档基本是没问题的，不过你还是需要根据你的代码的理解核对一下===
