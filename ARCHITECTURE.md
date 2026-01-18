# SerialUtil Architecture Design

## 1. System Overview

SerialUtil is a desktop application built with **Tauri** (Rust) for the backend and **React** (TypeScript/Vite) for the frontend.

### Core Technologies
- **Backend**: Rust, Tauri Core, `serialport-rs` crate.
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons.
- **Communication**: Tauri IPC (Inter-Process Communication).

## 2. IPC Interface (Frontend <-> Backend)

The communication between the UI and the Serial Engine is handled via Tauri's IPC mechanism.

### Commands (Frontend -> Backend)

| Command | Arguments | Return Type | Description |
|---------|-----------|-------------|-------------|
| `get_ports` | None | `Vec<String>` | Returns a list of available serial ports (e.g., `["COM1", "COM8"]`). |
| `connect` | `port_name: String`, `baud_rate: u32` | `Result<(), String>` | Opens the specified serial port. Starts a background thread for reading. |
| `disconnect` | None | `Result<(), String>` | Closes the currently open serial port and stops the reading thread. |
| `send` | `content: String` | `Result<usize, String>` | Sends data to the serial port. Currently supports UTF-8 string data. |

### Events (Backend -> Frontend)

| Event Name | Payload | Frontend Handling |
|------------|---------|-------------------|
| `serial-data` | `Vec<u8>` | **Crucial:** Received as `number[]` by Tauri/Serde. The frontend **MUST** convert this to `Uint8Array` before usage to ensure proper byte manipulation. |

### Data Handling Detail
Tauri's serialization layer passes Rust's `Vec<u8>` as a standard JSON array of numbers to the WebView.
- **Problem**: Passing `number[]` directly to `TextDecoder` or hex formatters can be inefficient or incorrect if types are mismatched.
- **Solution**: The `SerialService.listen` wrapper in `src/ui/src/services/ipc.ts` explicitly casts the payload:
  ```typescript
  callback(new Uint8Array(event.payload));
  ```

## 3. Frontend Architecture

### Component Structure
- **`App.tsx`**: The main controller.
  - Manages global state: `ports`, `connected` status, `logs` buffer.
  - Handles IPC connection lifecycles (`useEffect`).
  - Implements the log buffer limit (circular buffer strategy, max 10k items).
- **`TerminalContainer.tsx`**:
  - Responsible for rendering the log list.
  - **Rendering Strategy**: Currently uses a native `div` with `overflow-y-auto` and `.map()` for robustness. (virtualization libraries were removed to resolve environment-specific rendering issues).
  - Features: Auto-scroll, Clear, View Modes (ASCII/HEX).
- **`LogEntry.tsx`**:
  - Pure component for rendering a single log line.
  - Supports HEX view (formatted hex strings) and ASCII view.

### Services
- **`ipc.ts` (`SerialService`)**:
  - Static class encapsulating all Tauri `invoke` and `listen` calls.
  - Provides strict typing for the application layer.

## 4. Backend Design (Rust)

Located in `src-tauri/src/lib.rs`.

- **`SerialAppState`**: Wraps a `Mutex<Option<Box<dyn SerialPort>>>` to manage the singleton serial port instance.
- **Threading**:
  - Upon connection, a new thread (`std::thread::spawn`) is created to loop on `port.read()`.
  - Data read is emitted immediately to the frontend via `app_handle.emit("serial-data", buffer)`.
  - Thread termination is handled by checking a shared flag or channel (implementation detail managed by `SerialManager`).

## 5. Future Considerations
- **Virtualization**: If log performance drops with >10k items, re-evaluate `react-window` or `tanstack-virtual` with proper Vite configuration.
- **Binary Sending**: The current `send` command accepts strings. Future updates should support `Vec<u8>` or Hex input for binary transmission.