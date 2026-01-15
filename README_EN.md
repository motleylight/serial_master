# SerialMaster

SerialMaster is a next-generation, cross-platform serial debugging tool built on a modern technology stack (Rust + Tauri + React). It is not just a simple serial terminal, but a powerful serial development platform integrated with multiple innovative features.

## Core Features

### 1. Ultimate Performance & Modern Experience
**Started with Aesthetics, Loyal to Experience.**
SerialMaster adopts the industry-leading **Shadcn UI** component library and **React** framework to bring you an unprecedented serial debugging experience.
*   **Exquisite Visual Design**: Adopts a clean and airy modern design language, bidding farewell to the cluttered interfaces of traditional tools. Carefully tuned typography and spacing improve readability. Every interactive element is polished to be both beautiful and practical.
*   **Smooth Interaction**: Thanks to modern frontend technology, all operations have smooth micro-interactions. List scrolling is silky smooth, and rendering millions of log lines is lag-free.
*   **Smart User Guidance**: Automatically parses manufacturer and product names of USB devices (e.g., "CP2102 USB to UART Bridge Controller"), replacing cold "COMx" labels with friendly names for instant identification.
*   **Rust Core Driver**: Not just good-looking, but also robust. Powered by Rust + Tokio, leveraging memory safety and asynchronous high concurrency to ensure stable transmission without dropping a single byte, even at extremely high baud rates.

### 2. External Pipeline Hooks
**Process data in your most familiar language.**
Embracing the **Unix Pipeline Philosophy** and taking "Do one thing and do it well" to the extreme. SerialMaster breaks free from the limitations of built-in script engines, seamlessly integrating with the entire operating system via **Standard Streams (Stdio)**.
*   **Language Agnostic**: You can use Python, Node.js, Lua, Shell, or any language you can run to write data processing logic.
*   **Bidirectional Interception**:
    *   **Tx Hook**: Encrypt, encapsulate, or validate data before sending.
    *   **Rx Hook**: Parse, filter, or trigger system-level automation tasks after receiving data.
*   **High Performance**: Backend asynchronous stream processing ensures high data throughput.

### 3. Exclusive Port Sharing Technology (In Development)
**Solving the "Port Occupied" Pain Point.**
SerialMaster includes built-in virtualization technology based on com0com, realizing **multi-application distribution for a single physical serial port**.
*   **One-to-Many Mode**: Allows other serial software (such as serial plotters, legacy host software) to connect to the same physical serial port simultaneously and work in parallel with SerialMaster.
*   **Fully Automatic Management**: No need to manually configure complex virtual drivers; the software has built-in driver detection, virtual pair creation, and routing management functions.
*   **Zero Intrusion**: Existing business software can be accessed without modifying any code.

### 4. Modern Configuration Management
*   **YAML Configuration**: All configurations (baud rate, flow control, script paths, command lists) are persistently stored in YAML format, making them easy to read and version control.
*   **Auto-Save**: Automatically remembers various toggle states and window layouts, ready to use upon opening.

## Tech Stack

This project demonstrates best practices for building modern desktop applications:

*   **Frontend**: React 19, TypeScript, Tailwind CSS, Shadcn UI
*   **Backend**: Rust, Tauri v2 (Async/Await)
*   **Core**: serialport-rs, tokio
*   **Virtualization**: com0com (Windows) Integration Management

## Quick Start

### Requirements
*   Windows 10/11 (Recommended) / macOS / Linux
*   **Port Sharing Feature** requires com0com driver installation (Windows).

### Installation & Running

1.  **Start Backend & UI** (Dev Mode):
    ```bash
    # Terminal 1: Start frontend dev server
    cd src/ui
    npm install
    npm run dev

    # Terminal 2: Start Tauri backend (Root directory)
    npx tauri dev
    ```

2.  **Build Release Version**:
    ```bash
    npx tauri build
    ```

## User Guide

### Enable Port Sharing
1.  Ensure com0com is installed.
2.  Connect to a physical serial port (e.g., COM3) in SerialMaster.
3.  Click **"Enable Sharing"** in the toolbar.
4.  SerialMaster will automatically create a virtual port (e.g., COM10). Connect other software to COM10 to receive a copy of data from COM3.

### Configure Script Hooks
1.  Write your script (e.g., `processor.py`), ensuring it reads binary data from `stdin`, processes it, and writes to `stdout`.
2.  In SerialMaster settings, enter the execution command: `python /path/to/processor.py`.
3.  Check "Rx Hook" or "Tx Hook" to enable.

## License

MIT License
