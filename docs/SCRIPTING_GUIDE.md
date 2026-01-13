# 脚本功能使用指南

SerialMaster 在 Phase 2 引入了强大的可编程脚本系统，基于 `RustPython` 引擎。该系统允许用户使用 Python 语法 hook 串口数据流，从而实现动态的数据修改和自定义协议处理。

## 1. 概览
脚本系统目前支持 **Tx Hook** (发送前处理) 和 **Rx Hook** (接收过滤)。
用户可以在发送数据之前，通过 Python 脚本拦截并修改数据。这对于添加校验和 (CRC/Checksum)、动态添加包头包尾、或者根据算法加密数据非常有用。

**核心特性:**
- **语言**: Python 3 (通过 RustPython 嵌入式引擎)
- **触发时机**: 点击“发送”按钮后，数据实际写入串口之前。
- **环境**: 独立的 Python 虚拟机环境。

## 2. 如何使用

1.  **打开编辑器**:
    - 在连接控制栏 (Control Panel) 的右侧，点击蓝色的 **"Scripting"** 按钮。
2.  **编写脚本**:
    - 在弹出的编辑器中，选择 **"Tx Hook"** 标签页。
    - 输入 Python 代码。
3.  **保存与应用**:
    - **Apply**: 点击 "Apply" 按钮，将当前脚本加载到后台引擎中生效（内存中，重启重置）。
    - **Save to File**: 点击 "Save to File" (下载图标)，将脚本保存为 `.py` 文件到本地。
    - **Open File**: 点击 "Open File" (文件夹图标)，加载本地 `.py` 脚本。
4.  **模板 (Templates)**:
    - 使用编辑器左上角的下拉菜单，快速加载常用脚本模板 (如 CRC16, 过滤等)。

## 3. Tx Hook 详解 (Pre-send Hook)

### 上下文变量
- `data`: 这是一个此时此刻准备发送的字节列表 (`list` of `int`, 0-255)。

### 你的任务
- 修改 `data` 变量。你可以直接修改它 (in-place modification) 或者将新的列表赋值给 `data`。
- 系统会自动读取脚本执行后的 `data` 变量，并将其作为最终数据发送到串口。

### 示例代码

#### 示例 1: 追加简单的后缀 (如换行符)
```python
# 给因为某些原因不能在UI设置换行的场景
# 0x0A is '\n'
data.append(0x0A)
```

#### 示例 2: 添加包头和包尾
```python
# 假设协议是: [HEADER 0xAA 0x55] [DATA] [FOOTER 0xFF]
header = [0xAA, 0x55]
footer = [0xFF]

# 重新组合 data
data = header + data + footer
```

#### 示例 3: 计算简单的校验和 (Checksum)
```python
# 计算所有字节的和 (取低8位)
checksum = 0
for byte in data:
    checksum = (checksum + byte) & 0xFF

data.append(checksum)
```

#### 示例 4: 数据加密 (简单的 XOR)
```python
# 对每个字节进行异或 0x55
for i in range(len(data)):
    data[i] = data[i] ^ 0x55
```

#### 示例 5: CRC16-Modbus 校验
用于工业场景常见的 Modbus 协议。
```python
# Pure Python Implementation of CRC16-Modbus
# Poly: 0xA001 (Reversed 0x8005), Init: 0xFFFF
crc = 0xFFFF
for byte in data:
    crc ^= byte
    for _ in range(8):
        if crc & 1:
            crc = (crc >> 1) ^ 0xA001
        else:
            crc >>= 1

# Modbus通常是低字节在前 (Little Endian)
data.append(crc & 0xFF)         # Low byte
data.append((crc >> 8) & 0xFF)  # High byte
```

#### 示例 6: CRC16-CCITT (XModem) 校验
```python
# Pure Python CRC16-CCITT (XModem version)
# Poly: 0x1021, Init: 0x0000
crc = 0x0000
for byte in data:
    crc ^= (byte << 8)
    for _ in range(8):
        if crc & 0x8000:
            crc = (crc << 1) ^ 0x1021
        else:
            crc <<= 1
    crc &= 0xFFFF # 保持16位

# Big Endian (通常)
data.append((crc >> 8) & 0xFF)
data.append((crc >> 8) & 0xFF)
data.append(crc & 0xFF)
```

## 4. Rx Hook 详解 (Receive Hook)

### 上下文变量
- `data`: 这是一个此时此刻从串口接收到的字节列表 (`list` of `int`)。

### 你的任务
- 修改 `data` 变量。
- 如果将 `data` 设置为空列表 `[]`，系统将丢弃该包，UI 不会显示任何内容。
- 如果修改 `data`，UI 将显示修改后的内容。

### 示例代码

#### 示例 1: 简单的过滤 (丢弃特定数据)
```python
# 如果包含 0xFF，则认为是噪声，丢弃整个包
if 0xFF in data:
    data = []
```

#### 示例 2: 过滤控制字符
```python
# 只保留可打印字符 (ASCII 32-126) 和换行符
data = [b for b in data if (32 <= b <= 126) or b == 0x0A or b == 0x0D]
```

#### 示例 3: 自动回复 (简单的应答机)
*注意: 目前 Rx Hook 仅用于处理**接收数据**的显示，不能直接触发发送。自动回复功能将在 Phase 3 实现。*

## 4. 标准库与环境限制

### 可用功能
- **内置函数**: `len()`, `range()`, `min()`, `max()`, `int()`, `hex()`, `print()` (print 内容会在后端日志显示) 等 Python 核心内置函数。
- **基本类型**: `list`, `dict`, `tuple`, `str`, `bytes`, `int` 等。
- **控制流**: `if`, `for`, `while`, `try-except` 等。

### 不可用功能
为了确保嵌入式环境的安全性和启动速度，当前环境模式为 **Standalone Mode**，**不包含**任何 Python 标准库。
- ❌ `import sys`
- ❌ `import os`
- ❌ `import struct` (请使用位运算代替 `struct.pack`)
- ❌ `import math`
- ❌ `import json`

如果需要复杂的算法 (如加密库)，目前需要使用纯 Python 实现该算法（如上面的 CRC 示例）。

## 5. 限制与注意事项

- **错误处理**: 如果脚本语法错误 (SyntaxError) 或运行时出错 (RuntimeError)，发送操作将中断，UI 会弹出错误提示。
- **性能**: 每次发送都会初始化一个新的 VM 上下文。对于简单的逻辑 (如 CRC 计算)，耗时通常在 **毫秒级**，对于 10ms 间隔的高频发送是可以接受的。但请避免在脚本中编写死循环或极高复杂度的计算。

## 5. 常见问题 (FAQ)

**Q: 只有 `Tx Hook` 吗？**
A: 支持 `Tx Hook` (发送前) 和 `Rx Hook` (接收前)。你可以在脚本编辑器中切换标签页。

**Q: 脚本能保存吗？**
A: 可以。编辑器顶部提供了 "Save to File" 和 "Open File" 按钮，方便你将脚本保存到本地磁盘（.py 格式）。但是，重启软件后，需要重新点击 "Apply" 按钮或加载文件来激活脚本（后台状态默认重置）。

**Q: 支持哪些 Python 版本？**
A: 语法兼容 Python 3。
