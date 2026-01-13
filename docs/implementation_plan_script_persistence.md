# Implementation Plan - Phase 2.2: Script Persistence & Templates

## Goal Description
Allow users to save scripts to local files (`.py`), load them back, and quickly insert common script templates (like CRC, Framing).

## Proposed Changes

### Frontend (React)
#### [MODIFY] [ScriptEditor.tsx](file:///d:/SerialMaster/src/ui/src/components/ScriptEditor.tsx)
- **Imports**: Import `open`, `save` from `@tauri-apps/plugin-dialog`, `readTextFile`, `writeTextFile` from `@tauri-apps/plugin-fs`.
- **UI Changes**:
    - Rename "Save" (to backend) to **"Apply"**.
    - Add **"Open File"** button (FolderOpen icon).
    - Add **"Save File"** button (Download/Disc icon).
    - Add **"Templates"** dropdown/select.
- **Values**:
    - Define constant `TEMPLATES` with logic for Tx and Rx.
    - Implement `handleOpenFile` and `handleSaveFile`.

#### [MODIFY] [SCRIPTING_GUIDE.md](file:///d:/SerialMaster/docs/SCRIPTING_GUIDE.md)
- Update manual to explain "Apply" vs "Save File".
- Mention available templates.

## Verification Plan
1.  **Templates**: Click "CRC16-Modbus", verify code fills editor.
2.  **File Save**: Write random code, click Save File, save as `test.py`. verify file exists.
3.  **File Load**: Clear editor, click Open File, select `test.py`, verify content loaded.
4.  **Apply**: Click Apply, verify script works (Rx/Tx hook active).
