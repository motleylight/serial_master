# Binary Size Analysis & Optimization Plan

## Current Status
- **Current Size**: ~25.4 MB (`serial_util_tauri.exe`)
- **Frontend Assets**: < 1 MB (Estimated from source types)
- **Backend (Rust)**: ~24+ MB

## Composition Analysis
1.  **RustPython (Biggest Contributor)**: Embedding a full Python interpreter (compiler + VM) contributes significantly (likely 10MB+).
2.  **Missing Build Optimizations**: The `Cargo.toml` lacks a `[profile.release]` section. By default, this means:
    - Symbols might not be fully stripped.
    - **LTO (Link Time Optimization)** is disabled.
    - **Codegen Units** is default (parallel compilation = larger binary).
    - **Panic Strategy** is `unwind` (requires table lookups).
3.  **Tokio "Full"**: The dependency `tokio = { features = ["full"] }` pulls in unnecessary modules (net, time, fs, io-std, etc.) even if not all are used.

## Optimization Plan

### Step 1: Cargo Profile Optimizations (High Impact, Low Risk)
Add the following to `src/tauri/Cargo.toml`. This typically reduces binary size by **30% - 50%** without changing code.

```toml
[profile.release]
codegen-units = 1      # Compile slower, but better optimization
lto = true             # Enable Link Time Optimization
opt-level = "z"        # Optimize for size ("s" or "z")
panic = "abort"        # Remove stack unwinding support (smaller)
strip = true           # Strip symbols from binary
```

### Step 2: Dependency Pruning (Medium Impact)
1.  **Tokio**: Identify used features and remove `full`.
    - Likely needed: `rt-multi-thread`, `macros`, `sync`, `io-util`.
    - Likely removable: `net` (unless SerialPort uses it?), `fs` (used by tauri-plugin-fs, but maybe tokio's isn't needed directly).
2.  **RustPython**: Check compile-time features. Explicitly disable unused standard library modules if `default-features = false`.

### Step 3: Compression (Optional)
- **UPX**: Use `upx --best serial_util_tauri.exe`. This can compress the 24MB EXE to ~8MB executable. However, it may trigger antivirus false positives.

## 4. Final Results (2026-01-13)

By applying the `[profile.release]` optimizations (LTO, Strip, Opt-level 'z', Panic Abort), we achieved massive size reductions:

| Component | Initial Size | Optimized Size | Reduction |
| :--- | :--- | :--- | :--- |
| **Main Executable** (`.exe`) | ~25.4 MB | **8.63 MB** | **-66%** |
| **Installer** (`setup.exe`) | ~7.0 MB | **2.65 MB** | **-62%** |

### Key Contributors to Reduction:
1.  **Strip Symbols**: Removed debug symbols which were likely a large part of the initial 25MB.
2.  **LTO (Link Time Optimization)**: Aggressively removed unused code from `rustpython` and `windows` crates across the entire compilation unit.
3.  **Opt-level "z"**: Prioritized size over speed, compacting the remaining logic.

The application is now extremely lightweight while retaining full Python scripting capabilities.
