# SerialMaster (串口大师)

SerialMaster 是一款基于现代技术栈（Rust + Tauri + React）构建的下一代跨平台串口调试工具。它不仅仅是一个简单的串口终端，更是一个集成了多个创新特性的强大串口开发平台。

## 核心特性

### 1. 极致性能与现代体验
**始于颜值，忠于体验。**
SerialMaster 采用了业界领先的 **Shadcn UI** 组件库与 **React** 框架，为您带来前所未有的串口调试体验。
*   **精美的视觉设计**：采用清爽通透的现代设计语言，告别传统串口工具拥挤陈旧的控件堆砌。精心调优的字体与间距，提升信息的阅读效率。每一个交互控件都经过精心打磨，既美观又实用。
*   **丝滑的交互反馈**：得益于现代化的前端技术，所有操作均有流畅的微交互动画。列表滚动丝般顺滑，百万级日志渲染毫无卡顿。
*   **智能的用户引导**：自动解析 USB 设备的厂商与产品名称（如 "CP2102 USB to UART Bridge Controller"），用友好的名称替代冰冷的 "COMx"，让您一眼识别目标设备。

### 2. 外部管道脚本挂钩 (External Pipeline Hooks)
**用你最熟悉的语言处理数据。**
秉承 **Unix 管道哲学**，将 "Do one thing and do it well" 发挥到极致。SerialMaster 不再束缚于内置脚本引擎的贫瘠生态，而是通过**标准流（Stdio）**接口与整个操作系统无缝融合。
*   **语言无关性**：你可以使用 Python, Node.js, Lua, Shell 等任何你能运行的语言编写数据处理逻辑。
*   **双向拦截**：
    *   **Tx Hook**: 在数据发送前进行加密、封装或校验。
    *   **Rx Hook**: 在数据接收后进行解析、过滤或触发系统级自动化任务。
*   **高性能**：后端异步流处理，保证数据吞吐。

### 3. 独家端口共享技术 (Port Sharing)（开发中）
**解决"端口被占用"的痛点。**
SerialMaster 内置了基于 com0com 的虚拟化技术，实现了**单物理串口的多应用分发**。
*   **一拖多模式**：允许其他串口软件（如串口绘图工具、旧版上位机）同时连接到同一个物理串口，与 SerialMaster 并行工作。
*   **全自动管理**：无需手动配置复杂的虚拟驱动，软件内置驱动检测、虚拟对创建与路由管理功能。
*   **零侵入性**：原有业务软件无需修改任何代码即可接入。

### 4. 现代化的配置管理
*   **YAML 配置文件**：所有配置（波特率、流控、脚本路径、命令列表）均采用 YAML 格式持久化存储，易于阅读和版本控制。
*   **自动保存**：各种开关状态、窗口布局自动记忆，打开即用。

## 技术栈

本项目展示了构建现代桌面应用的最佳实践：

*   **Frontend**: React 19, TypeScript, Tailwind CSS, Shadcn UI
*   **Backend**: Rust, Tauri v2 (Async/Await)
*   **Core**: serialport-rs, tokio
*   **Virtualization**: com0com (Windows) 集成管理

## 快速开始

### 运行环境
*   Windows 10/11 (推荐) / macOS / Linux
*   **端口共享功能** 需要安装 com0com 驱动 (Windows)。

### 安装与运行

1.  **启动后端与 UI** (开发模式):
    ```bash
    # 终端 1: 启动前端监听
    cd src/ui
    npm install
    npm run dev

    # 终端 2: 启动 Tauri 后端 (根目录)
    npx tauri dev
    ```

2.  **构建发布版**:
    ```bash
    npx tauri build
    ```

## 使用指南

### 开启端口共享
1.  确保已安装 com0com。
2.  在 SerialMaster 中连接物理串口（如 COM3）。
3.  点击工具栏的 **"启用共享"** (Enable Sharing)。
4.  SerialMaster 会自动创建一个虚拟端口（如 COM10），其他软件连接 COM10 即可获得 COM3 的数据副本。

### 配置脚本钩子
1.  编写你的脚本（例如 processor.py），确保它从 stdin 读取二进制数据，处理后写入 stdout。
2.  在 SerialMaster 设置中填入执行命令：`python /path/to/processor.py`。
3.  勾选启用 "Rx Hook" 或 "Tx Hook"。

## 许可证

MIT License
