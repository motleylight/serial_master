# Implementation Plan - Enhanced Serial Master Features

This plan covers the implementation of missing features found in standard serial port debugging tools.

## User Review Required

> [!IMPORTANT]
> **Breaking Change**: The `connect` and `send` commands in the backend will be updated. `connect` will require a full configuration object, and `send` will accept a byte array (`Vec<u8>`) instead of a String to support raw binary/HEX transmission.

## Proposed Changes

### Backend (Rust)

#### [MODIFY] [serial_manager.rs](file:///d:/SerialMaster/src/core/serial_manager.rs)
- Update `open` method to accept a configuration struct (Baud, DataBits, StopBits, Parity, FlowControl) instead of just baud rate.
- Use `serialport` builder methods to apply these settings.

#### [MODIFY] [src/tauri/src/commands.rs](file:///d:/SerialMaster/src/tauri/src/commands.rs)
- Define `SerialConfig` struct derived from `serde::Deserialize`.
- Update `connect` command to accept `SerialConfig`.
- Update `send` command to accept `Vec<u8>` (payload) instead of String.

#### [MODIFY] [src/tauri/src/lib.rs](file:///d:/SerialMaster/src/tauri/src/lib.rs)
- (Check if any exports need updating, likely not if logic is contained in commands).

### Frontend (React/TypeScript)

#### [MODIFY] [src/ui/src/services/ipc.ts](file:///d:/SerialMaster/src/ui/src/services/ipc.ts)
- Update `connect` to accept `SerialConfig` object.
- Update `send` to accept `Uint8Array` or `number[]`.

#### [NEW] [src/ui/src/components/SettingsPanel.tsx](file:///d:/SerialMaster/src/ui/src/components/SettingsPanel.tsx)
- Create a configuration panel for Port, Baud Rate, Data Bits, Stop Bits, Parity, Flow Control.

#### [MODIFY] [src/ui/src/App.tsx](file:///d:/SerialMaster/src/ui/src/App.tsx)
- Integrate `SettingsPanel`.
- Add state for serial configuration.
- Add state for UI toggles: `hexDisplay`, `hexSend`, `addTimestamp`, `appendNewline`.
- Implement `CommandManager` logic (store commands list).

#### [MODIFY] [src/ui/src/components/Terminal/TerminalContainer.tsx](file:///d:/SerialMaster/src/ui/src/components/Terminal/TerminalContainer.tsx)
- Support `hexDisplay` prop to render data as HEX strings.
- Support `addTimestamp` prop (or verify existing logic).

#### [NEW] [src/ui/src/components/CommandManager.tsx](file:///d:/SerialMaster/src/ui/src/components/CommandManager.tsx)
- UI to list saved commands.
- "Add", "Edit", "Remove" buttons.
- "Import", "Export" functionality (JSON file).
- "Send" button for each command.

#### [MODIFY] [src/ui/src/components/InputArea.tsx](file:///d:/SerialMaster/src/ui/src/components/InputArea.tsx) (or equivalent in App.tsx)
- Add History support (Up/Down arrow).
- Handle "Hex Send" logic (parse hex string to bytes).
- Handle "Append Newline" logic.

## Verification Plan

### Automated Tests
- None existing for GUI.

### Manual Verification
1.  **Serial Settings**:
    - Connect to a virtual serial pair (e.g., com0com or similar if available, or just real hardware).
    - Verify changing Baud Rate works (checked by loopback test if possible).
2.  **Hex Send/Receive**:
    - Enable "Hex Display". Receive known data. Verify it shows as `XX XX`.
    - Enable "Enable Hex Send". Java strict `AA BB`. Verify backend receives `[0xAA, 0xBB]`.
3.  **Command Manager**:
    - Create a command.
    - Export to file.
    - Delete command.
    - Import from file.
    - Verify command is back.
4.  **History**:
    - Type A, Send. Type B, Send.
    - Press Up -> B. Press Up -> A. Press Down -> B.

