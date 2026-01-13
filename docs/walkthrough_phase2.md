# Phase 2 Verification Walkthrough

## Scripting System Test

We have implemented the Python Scripting Engine (RustPython) and the Script Editor.

### Prerequisites
- Backend running (`cargo tauri dev` or `npm run tauri dev`).
- Frontend running.
- COM ports available (e.g. COM8/COM9 pair).

### Steps

1. **Open Script Editor**
   - Locate the blue "Scripting" button in the Control Panel (top right, next to Connect/Disconnect).
   - Click to open the modal.

2. **Configure Pre-send Hook**
   - Ensure "Pre-send Hook" tab is selected.
   - Enter the following Python code:
     ```python
     # Append '!' (0x21) to the data
     data.append(0x21)
     ```
   - Click "Save".

3. **Verify**
   - Connect to COM8.
   - Open a separate terminal or use `scripts/verify_scripting.py` to listen on COM9.
   - In the app, send the text `Hello`.
   - **Expected Result**: 
     - COM9 should receive `Hello!` (The original "Hello" plus the appended "!").
     - The App's terminal (TX log) might show the original data or modified data depending on implementation. (Currently shows input data).

4. **Advanced Test**
   - Try a prepend script:
     ```python
     # Prepend header 0xAA 0xBB
     data = [0xAA, 0xBB] + data
     ```
   - Send `123`.
   - Expected on receiver: `AA BB 31 32 33`.

### Troubleshooting
- If compilation fails, ensure `rustpython` dependencies is fully downloaded.
- If script doesn't run, check the backend logs (console).
