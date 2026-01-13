# Implementation Plan - Phase 2.1: Rx Hook Scripting

## Goal Description
Implement the Rx Hook (Receive Hook) to allow users to process/filter data received from the serial port using Python scripts before it reaches the UI.

## Proposed Changes

### Backend (Rust)
#### [MODIFY] [scripting.rs](file:///d:/SerialMaster/src/tauri/src/scripting.rs)
- Add `rx_script` field to `ScriptManager`.
- Implement `run_rx_script` method (similar to `run_pre_send`).
- Support data filtering: if script returns different data, modify it.

#### [MODIFY] [lib.rs](file:///d:/SerialMaster/src/tauri/src/lib.rs)
- In the `setup` hook, access `ScriptManager`.
- In the RX event loop (`rx.recv()`), invoke `script_manager.run_rx_script(data)`.
- Use the modified data for `app_handle.emit`.

#### [MODIFY] [commands.rs](file:///d:/SerialMaster/src/tauri/src/commands.rs)
- Update `set_script` to match `rx` type.

### Frontend (React)
#### [MODIFY] [ScriptEditor.tsx](file:///d:/SerialMaster/src/ui/src/components/ScriptEditor.tsx)
- Add "Rx Hook" tab.
- Update save logic to send `rx` script type.

#### [MODIFY] [SCRIPTING_GUIDE.md](file:///d:/SerialMaster/docs/SCRIPTING_GUIDE.md)
- Update documentation with Rx Hook examples.

## Verification Plan

### Manual Verification
1.  **Setup**: Run `verify_scripting.py` or use a loopback.
2.  **Filter Test**: Script to valid check/drop Data.
    - Script: `if 0xFF in data: data = []` (Drop if contains 0xFF).
3.  **Modify Test**:
    - Script: `data = [0xAA] + data` (Prepend tag).
4.  **Send Data**:
    - Send from external source.
    - Verify UI terminal shows modified data.
