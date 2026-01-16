# SerialMaster 项目文档 (Phase 1)

本文档详细说明了 SerialMaster 项目当前阶段（Phase 1: MVP）的功能、架构组成及使用方法。

## 1. 项目概览
SerialMaster 是一个基于 Rust (Tauri) 和 React 的高性能现代串口调试助手。
目前已完成 **MVP (最小可行性产品)** 开发，具备以下核心能力：
- **跨平台架构**: Rust 后端 + Web 前端。
- **设备管理**: 自动扫描并列出系统串口。
- **基本通信**: 支持设置波特率 (默认 115200) 并打开/关闭串口。
- **高性能日志**: 支持高频数据接收，具备虚拟滚动 (Virtual Scrolling) 和 Hex/ASCII 视图切换功能。
- **持久化配置**: 支持自动保存串口参数、UI 设置 (发送模式、换行符等) 以及常用命令到 YAML 配置文件。
- **测试工具**: 内置 Pyhon/Rust 数据生成工具用于回环测试。

---

## 2. 详细使用说明

### 2.1 启动主程序 (Main Application)

主程序由两个部分组成：**后端 (Tauri Core)** 和 **前端 (UI)**。开发模式下需要分别启动。

#### 方式一：一键启动 (推荐，需环境支持)
在 `src/tauri` 目录下运行：
```powershell
# 这会自动启动后端，并由后端自动启动前端服务 (通过 beforeDevCommand)
# 注意：如果遇到 npm 路径问题或文件占用报错，请使用方式二
cd src/tauri
npx @tauri-apps/cli dev
# 或者
cargo run
```

#### 方式二：手动分步启动 (稳定)
**步骤 1：启动前端**
打开终端 A：
```powershell
cd src/ui
npm run dev
```
*等待输出： `Local: http://localhost:5173/`*

**步骤 2：启动后端**
打开终端 B：
```powershell
cd src/tauri
# 确保 cargo 依赖已构建 (首次运行可能较慢)
npx @tauri-apps/cli dev
```
*成功后会自动弹出一个名为 "SerialMaster" 的独立窗口。请勿直接在浏览器访问 localhost:5173，因为浏览器环境没有串口访问权限。*

### 2.2 功能操作
1.  **连接串口**:
    *   在左侧或顶部工具栏找到 "Connect COM8" 按钮（目前 MVP 阶段硬编码为 COM8/115200 用于快速测试）。
    *   点击连接，如果成功，按钮状态变为 "Connected"，并在日志区显示 `[SYS] Connected...`.
2.  **发送数据**:
    *   点击 "Send Hello"，会向串口发送 "Hello Rust!" 字符串。
3.  **查看日志**:
    *   **视图切换**: 点击右上角的 `ASCII` / `HEX` 按钮切换显示模式。
    *   **自动滚动**: 点击 `Auto Scroll` 图标（绿色为开启）。向上滚动日志时自动暂停跟随，拉到底部自动恢复。
    *   **清空**: 点击垃圾桶图标清空当前屏幕日志。

### 2.3 配置文件与命令管理 (Configuration & Commands)

SerialMaster 支持将您的使用习惯和常用命令持久化保存。所有配置文件均为 **YAML** 格式，方便阅读和手动编辑。

**文件位置**:
配置文件存储在系统的标准 AppConfig 目录下：
*   **Windows**: `%APPDATA%\com.serialmaster.app\` (通常是 `C:\Users\YourName\AppData\Roaming\com.serialmaster.app\`)
*   **Linux**: `~/.config/com.serialmaster.app/`
*   **macOS**: `~/Library/Application Support/com.serialmaster.app/`

**主要文件**:

1.  **`config.yaml`** (自动保存)
    *   记录上次使用的串口参数（波特率、数据位等）。
    *   记录 UI 设置（Hex模式、换行符设置、自动滚动状态等）。
    *   *提示*: 修改软件界面设置后会自动写入此文件，下次启动自动恢复。

2.  **`commands.yaml`** (快捷指令)
    *   记录在 "Command Manager" 侧边栏中添加的快捷指令。
    *   支持 Hex 和 ASCII 两种格式。
    *   **手动编辑**: 您可以直接用文本编辑器修改此文件，格式如下 (无需 ID 字段)：
        ```yaml
        - name: "Hello Cmd"
          command: "Hello World"
          isHex: false
        - name: "Hex Ping"
          command: "AA BB 01"
          isHex: true
        ```

---

### 2.4 脚本与自动化 (Scripts & Automation)

SerialMaster 允许您挂载自定义脚本到发送 (TX) 和接收 (RX) 的数据流中，实现动态数据修改或自动化逻辑。

1.  **开启配置**: 点击工具栏的 **"Script"** 按钮打开配置弹窗。
2.  **钩子类型 (Hooks)**:
    *   **TX Hook**: 在数据发送到串口**之前**执行 (例如：自动添加校验和)。
    *   **RX Hook**: 在从串口接收数据**之后**执行 (例如：自动解析特定协议)。
    *   支持 **JavaScript** (内置 V8 引擎) 和 **External Command** (外部可执行程序) 两种模式。
3.  **状态监控 (Status Pill)**:
    *   当脚本激活时，"Script" 按钮会变为**蓝色胶囊状态**。
    *   胶囊中间会显示当前运行的钩子类型 (`TX:JS`, `RX:EXT` 等)。
    *   **快速停止**: 点击胶囊最右侧的 **"X"** 按钮，可立即停止所有正在运行的脚本，无需打开菜单。

### 2.5 端口共享 (Port Sharing)

该功能解决了 "一个串口只能被一个软件占用" 的痛点。通过创建虚拟端口桥接，允许多个软件（包括 SerialMaster 和第三方助手）同时连接同一个物理串口。

1.  **开启共享**: 点击工具栏右侧的 **"Share Port"** 按钮。
2.  **配置流程**:
    *   在弹窗中选择当前的物理端口 (如 COM8)。
    *   开启 "Enable Sharing" 开关。
    *   系统会自动创建一对虚拟端口 (如 `CNCB0` <-> `COM10`)。
    *   **拓扑图**: 界面下方会显示实时的数据流向图，直观展示 SerialMaster 和 第三方 App 如何分流数据。
3.  **连接第三方软件**:
    *   您的第三方软件 (如上位机、烧录工具) 此时应连接 **COM10** (即界面显示的 "3rd Party App Port")。
    *   SerialMaster 保持连接物理端口 (COM8) 不变。
4.  **状态监控 (Status Pill)**:
    *   当共享开启时，按钮变为**紫色胶囊状态**。
    *   胶囊显示当前分发的虚拟端口号 (e.g. `COM10`)。
    *   **快速停止**: 点击胶囊最右侧的 **"X"** 按钮即可一键关闭端口共享并释放资源。

---

## 3. 测试工具 (Data Generator)

为了在没有真实串口设备的情况下测试软件，项目提供了数据生成脚本。

**原理**: 向 `COM9` 端口持续写入数据。
**前置条件**: 需要成对的虚拟串口 `COM8` <-> `COM9` (推荐使用 com0com 或 Virtual Serial Port Driver)。

### 3.1 Python 版本 (推荐)
位于 `scripts/flood_com9.py`。
*依赖*: `pyserial`

**运行方法**:
```powershell
# 1. 安装依赖
pip install pyserial

# 2. 运行脚本
python scripts/flood_com9.py
```
*效果*: 终端会每隔 50ms 打印 `Tx: ...`，此时在 SerialMaster (连接 COM8) 中应能看到源源不断的接收数据。

### 3.2 Rust 版本
位于 `src/bin/flood_com9.rs`。

**运行方法**:
```powershell
cargo run --bin flood_com9
```
*效果*: 同 Python 版本，但性能更高。

---

## 4. 常见故障排除

### Q: 启动时报错 `OS Error 32` (文件被占用)
*   **现象**: `cargo run` 或构建失败，提示 `.pdb` 或 `.exe` 无法访问。
*   **原因**: Windows 下常见问题，通常是程序未完全退出，或被杀毒软件/索引服务锁定。
*   **解决**:
    1.  手动关闭所有相关的终端窗口。
    2.  运行 `cargo clean` (位于项目根目录) 清理构建缓存。
    3.  重试。

### Q: 启动时报错 `OS Error 32` (文件被占用) - 终极解决方案
如果上述方法无效，请使用项目根目录下的 **`safe_run.ps1`** 脚本启动。
该脚本会将构建产物重定向到临时目录，从而避开 D 盘的文件锁定问题。
**使用方法**:
```powershell
.\safe_run.ps1
```
*注意*: 由于 `tauri.conf.json` 中 `beforeDevCommand` 为空，您仍需在另一个终端手动启动前端 (`npm run dev`)。


### Q: 浏览器打开 `localhost:5173` 显示报错或无法连接
*   **原因**: 本项目是 **Tauri 应用**，依赖操作系统底层的 API (Rust)。普通的 Chrome/Edge 浏览器环境不具备这些 API (`window.__TAURI__` 未定义)。
*   **解决**: 必须通过 `cargo run` 或 `tauri dev` 启动的**独立应用窗口**来使用。

### Q: 点击 "Connect" 没反应
*   **原因**: 可能是 COM8 不存在或被占用。
*   **解决**: 检查设备管理器是否有 COM8，或确保 `flood_com9` 脚本（占用 COM9）已运行且 COM8/COM9 已成对连接。
