# Implementation Plan - Phase 2: Scripting System

## Goal Description
Implement the Scripting System as defined in `DEVELOPMENT_PLAN.md` Phase 2. This enables users to inject custom Python logic to modify serial data before valid sending (Pre-send Hook) and potentially process data after sending (Post-send Hook, infrastructure only for now).

## User Review Required
> [!IMPORTANT]
> This integration adds `RustPython` which significantly increases the binary size and compile time.
> The current scripting environment is isolated and does not include the full Python standard library by default to ensure performance.

## Proposed Changes

### Backend (Rust)
#### [NEW] [scripting.rs](file:///d:/SerialMaster/src/tauri/src/scripting.rs)
- Defines `ScriptManager` to hold pre-send and post-send scripts.
- Uses `rustpython` to execute Python code.
- `run_pre_send`: Takes a `Vec<u8>`, converts to Python `list`, executes script, reads back `list` as `Vec<u8>`.

#### [MODIFY] [lib.rs](file:///d:/SerialMaster/src/tauri/src/lib.rs)
- Registers `ScriptManager` state.
- Exposes `scripting` module.

#### [MODIFY] [commands.rs](file:///d:/SerialMaster/src/tauri/src/commands.rs)
- Updates `send` command to invoke `script_manager.run_pre_send`.
- Adds `set_script` command to update scripts dynamically.

### Frontend (React)
#### [NEW] [ScriptEditor.tsx](file:///d:/SerialMaster/src/ui/src/components/ScriptEditor.tsx)
- Provides a Monaco Editor interface for writing Python scripts.
- Supports switching between Pre-send and Post-send hooks.
- Saves scripts to backend via `set_script`.

#### [MODIFY] [App.tsx](file:///d:/SerialMaster/src/ui/src/App.tsx)
- Adds `ScriptEditor` modal.
- Manages visibility state.

#### [MODIFY] [ControlPanel.tsx](file:///d:/SerialMaster/src/ui/src/components/ControlPanel.tsx)
- Adds a "Scripting" button to open the editor.

## Verification Plan

### Automated Tests
- Run `cargo check` to ensure Rust code validity.
- Use `scripts/verify_scripting.py` to listen on COM port.

### Manual Verification
1. **Setup**: Run SerialMaster and `verify_scripting.py` (COM9).
2. **Normal Send**: Send "Hello". Verify "Hello" received.
3. **Script Injection**:
   - Open Script Editor.
   - Enter Pre-send script: `data.append(0x21)` (Append '!').
   - Save.
4. **Hook Verification**:
   - Send "Hello".
   - Verify `verify_scripting.py` prints "Hello!".
5. **Complex Script**:
   - Script: `data = [0xAA, 0xBB] + data`.
   - Send "123".
   - Verify received: `AA BB 31 32 33`.
