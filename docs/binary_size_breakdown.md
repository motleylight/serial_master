# SerialMaster 主程序 (24MB) 体积构成分析

本分析基于 `target/release/deps` 目录下的编译中间产物 (`.rlib`) 实际大小。
**注意**: `.rlib` 文件包含未优化的中间代码和元数据，体积通常是最终链接后代码的 3-5 倍，但能准确反映各组件的**相对权重**。

## 1. 核心大头: RustPython (约占总权重的 40% - 50%)
RustPython 相关组件的中间产物非常巨大，意味着其包含大量的逻辑代码。
*   `rustpython_vm` (虚拟机核心): **48.3 MB** (.rlib)
*   `rustpython_stdlib` (标准库): **10.5 MB** (.rlib)
*   `rustpython_parser` (解释器): **10.4 MB** (.rlib)
*   `rustpython_ast` (语法树): **5.2 MB** (.rlib)
*   **分析**: 这是导致最终 EXE 较大的最主要原因。Python 虚拟机需要支持动态特性，很难被链接器（Linker）裁剪（Dead Code Elimination）。几乎所有的 VM 逻辑都会被保留在最终 EXE 中。

## 2. 框架基础: Tauri & 依赖 (约占总权重的 20% - 30%)
Tauri 的中间产物也很大，但 Linker 的裁剪效果通常好于 RustPython。
*   `tauri_utils`: **42.1 MB** (.rlib) - 包含大量通用工具，部分会被裁剪。
*   `tauri`: **10.9 MB** (.rlib) - 核心运行时。
*   `wry` (WebView 绑定): **2.4 MB** (.rlib)

## 3. 系统库: Windows API (看似大，实际小)
*   `windows` crate: **83.6 MB** (.rlib)
*   `windows_sys`: **30.8 MB** (.rlib)
*   **分析**: 也就是所谓的 "Zero-cost abstractions"。虽然中间文件巨大（包含所有 Windows API 定义），但最终只会链接你**实际用到**的那几个函数（打开串口、文件对话框等）。因此它对最终 EXE 体积贡献**非常小**。

## 4. 业务代码 (极小)
*   `serial_master_tauri_lib`: **31.3 MB** (.rlib)
*   **分析**: 这里主要是因为我们在 `lib.rs` 中重新导出了很多依赖，或者编译了大量的宏展开代码。实际业务逻辑（UI处理、串口转发）在最终二进制中可能只有几百 KB。

## 结论与证据
目前的 24MB 体积主要由 **RustPython** 撑起。
证据是 `rustpython_vm` 单个组件的编译产物就高达 48MB，而且由于其动态调用的特性，链接器很难安全地移除其中未使用的函数。相比之下，`windows` 库虽然高达 83MB，但最终能被裁剪到几乎忽略不计。

**如果必须进一步缩小体积，唯一的方案是移除或替换 RustPython。**
