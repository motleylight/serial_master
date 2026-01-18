# 串口分享模块设计文档 (Port Sharing Design Document)

## 1. 模块功能 (Module Features)

串口分享模块的核心功能是解决 Windows 系统下串口独占访问的限制，允许用户在 SerialUtil 占用物理串口的同时，将其“分享”给其他第三方软件使用。

### 核心能力
1.  **虚拟串口管理**：
    *   调用 `com0com` 驱动动态创建、删除、重命名成对的虚拟串口 (CNCAx <-> CNCBx)。
    *   自动识别系统中已存在的虚拟串口对。
2.  **透明数据透传 (Transparent Bridging)**：
    *   实现物理串口与虚拟串口之间的双向数据转发。
    *   **RX 路径**：物理串口接收的数据 -> 同时发送给 SerialUtil UI 显示 -> 转发给虚拟串口 B。
    *   **TX 路径**：从虚拟串口 B 接收的数据 (来自第三方软件) -> 转发给物理串口发送。
3.  **非侵入式接入**：
    *   第三方软件连接虚拟串口 A (External Port)，操作体验与连接真实物理串口完全一致。
    *   无需修改第三方软件任何代码。

---

## 2. 设计目的 (Design Philosophy)

*   **解决独占痛点**：通常调试串口时，打开监视器就无法使用业务软件，反之亦然。本模块旨在打破这一限制。
*   **调试与业务并行**：用户可以使用 SerialUtil 强大的分析功能（波形、日志、脚本）监控通信，同时保持原有的业务软件正常运行。
*   **用户体验优先**：
    *   自动化繁琐的驱动配置过程 (封装 `setupc.exe`)。
    *   提供直观的拓扑视图，让用户理解数据流向。
    *   区分“简易”与“高级”模式，满足不同层级用户需求。

---

## 3. 设计架构 (Architecture)

模块采用分层架构设计，确保硬件抽象层、业务逻辑层与 UI 层的解耦。

### 3.1 技术栈
*   **Backend**: Rust (Tauri Core)
*   **Frontend**: React + TypeScript
*   **Driver**: com0com (Null Modem Emulator)

### 3.2 架构分层
1.  **UI Layer (React)**
    *   `PortSharingDialog`: 主交互入口，提供配置向导。
    *   `PortSharingToggle`: 状态栏快捷开关与状态展示。
    *   `TopologyView`: 可视化展示端口连接关系。

2.  **Interface Layer (IPC)**
    *   `PortSharingService` (TypeScript): 前端服务单例，封装 IPC 调用。
    *   `commands.rs` (Rust): 暴露给前端的 Tauri 命令 (e.g., `enable_port_sharing`).

3.  **Business Logic Layer (Rust)**
    *   `PortSharingManager`: 状态机，管理共享会话的生命周期 (Enabled/Disabled)，维护虚拟端口列表。
    *   `SerialManager`: 核心数据链路控制器。在此处“劫持”物理串口的数据流并在内部实现分发（Bridging Logic）。

4.  **Driver Adapter Layer (Rust)**
    *   `Com0comManager`: 命令行包装器 (Wrapper)，负责执行 `setupc.exe`，解析输出并处理 UAC 提权问题。

### 3.3 权限提升机制 (Privilege Elevation Mechanism)

由于 `com0com` 的配置工具 `setupc.exe` 需要管理员权限才能对虚拟串口进行创建、修改、删除等操作，而 SerialUtil 默认以普通用户权限运行（避免安全风险和拖拽文件失效），因此引入了 **Admin Service** 机制：

1.  **架构设计**：
    *   **Main Process**: 普通权限运行，包含 GUI。
    *   **Admin Service**: 一个临时的后台进程，以管理员权限运行。
    *   **IPC Channel**: TCP Socket (`127.0.0.1:56789`)，用于两者通信。

2.  **工作流程**：
    *   当需要执行提权操作（如 `create_pair`）时，`Com0comManager` 尝试连接 IPC 端口。
    *   若连接失败，调用 PowerShell `Start-Process -Verb RunAs` 重新启动自身 exe，附加参数 `--admin-service`。
    *   此时会触发 Windows UAC 弹窗，用户确认后，Admin Service 在后台启动并监听端口。
    *   Main Process 建立连接，发送 JSON 指令 (`ExecuteSetupc`)。
    *   Admin Service 执行 `setupc.exe` 并将标准输出/错误流回传给 Main Process。
    *   主程序退出时，发送 `Shutdown` 指令关闭 Admin Service。

---

## 4. 拓扑设计与数据流 (Topology & Data Flow)

设计采用了 **"Internal Bridging" (内部桥接)** 模式，利用 SerialUtil 自身作为中继站。

### 4.1 端口角色定义
为了清晰描述数据流，我们将虚拟串口对中的两个端口定义如下：
*   **Internal Port (亦称 Port B)**:
    *   **用途**: 供 SerialUtil 内部连接。
    *   **方向**: 桥接物理串口数据。
    *   **示例**: `COM11` (CNCB0)
*   **External Port (亦称 Port A)**:
    *   **用途**: 供第三方软件 (Client App) 连接。
    *   **方向**: 模拟真实设备。
    *   **示例**: `COM10` (CNCA0)

### 4.2 数据流向图
```mermaid
graph LR
    ExternalDevice[外部物理设备] <===> PhysicalPort[物理串口 (e.g. COM3)]
    
    subgraph SerialUtil [SerialUtil 内部处理]
        PhysicalPort <==> SerialManager
        SerialManager ==> UI_Display[UI 终端显示]
        SerialManager <==> BridgeLogic[内部桥接逻辑]
    end

    BridgeLogic <==> VirtualPortB[虚拟串口 B (Internal)]
    
    subgraph com0com_Driver [com0com 驱动层]
        VirtualPortB <==.虚拟连接.==> VirtualPortA[虚拟串口 A (External)]
    end

    VirtualPortA <===> ThirdPartyApp[第三方软件]
```

---

## 5. 接口定义 (API Reference)

### 5.1 Tauri Commands (Rust Backend)
| 命令 | 参数 | 返回 | 描述 |
|------|------|------|------|
| `check_com0com_installed` | None | `bool` | 检查 setupc.exe 是否存在 |
| `get_virtual_pairs` | None | `Vec<PortPair>` | 获取当前所有虚拟端口对 |
| `create_virtual_pair` | `port_a: Option<String>, port_b: Option<String>` | `PortPair` | 创建新的虚拟端口对 |
| `remove_virtual_pair` | `pair_id: u32` | `()` | 删除指定 ID 的端口对 |
| `enable_port_sharing` | `physical_port: String, pair_ids: Vec<u32>` | `String` (Used Port Name) | 开启共享模式 |
| `disable_port_sharing` | None | `()` | 关闭共享模式 |

### 5.2 TypeScript Interfaces
```typescript
interface PortPair {
    pair_id: number;
    port_a: string; // External (给第三方用)
    port_b: string; // Internal (我们自己用)
}

interface SharingStatus {
    enabled: boolean;
    port_pairs: PortPair[];
    physical_port: string | null;
}
```

---

## 6. UI/UX 设计

### 6.1 设计原则
*   **极简启动**：用户只需两步即可通过默认设置分享端口（点击图标 -> 确认分享）。
*   **清晰的隐喻**：使用 "Source" (源) 和 "Clone" (克隆) 的概念，降低用户对 "虚拟串口对" 技术细节的理解成本。
*   **即时反馈**：当第三方软件连接或数据传输时，提供视觉反馈（如闪烁指示灯，待实现）。

### 6.2 界面构成

#### A. 状态栏入口 (PortSharingToggle)
*   **默认态**：灰色 "Share Port" 按钮。
*   **激活态**：紫色高亮 "Sharing"，并在旁边显示当前对外暴露的端口号 (Port A)。
    *   *功能*：点击端口号可直接复制到剪贴板，方便粘贴到第三方软件。

#### B. 主对话框 - 共享配置 (Simple View)
*   **源串口选择**：下拉选择物理串口。
*   **克隆端口列表**：
    *   复选框式选择要启用的虚拟链路。
    *   显示 "Main Port: COMx" (Port A) 引导用户连接。
    *   提供 "+ New Clone" 快速创建功能。
*   **行动按钮**：醒目的 "Start Sharing" / "Stop Sharing"。

#### C. 主对话框 - 高级管理 (Advanced View)
*   **拓扑概览 (Topology Diagram)**：
    *   动态绘制当前的数据流向结构。
    *   显示：`物理端口 -> Hub -> [Port B <-> Port A]`.
*   **CRUD 表格**：
    *   允许修改虚拟端口名称 (Rename)。
    *   允许删除没用的虚拟端口。
    *   显示底层的 Pair ID 和详细对应的 CNC 节点名。

### 6.3 交互逻辑细节
*   **自动依赖检测**：打开面板时自动检测 `com0com`。若未安装，显示警告 Banner 并提供下载链接指引。
*   **智能命名**：创建新端口对时，默认让驱动分配名称，但也支持用户自定义（如重命名为 `COM_VIRT`）。
*   **防误触**：在共享开启状态下，禁用物理串口切换和虚拟端口删除操作。
