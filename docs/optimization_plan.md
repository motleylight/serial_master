# Binary Size Analysis & Optimization Plan

## Current Status
- **Current Size**: ~25.4 MB (`serial_master_tauri.exe`)
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
- **UPX**: Use `upx --best serial_master_tauri.exe`. This can compress the 24MB EXE to ~8MB executable. However, it may trigger antivirus false positives.

## Estimated Result
Implementing **Step 1** alone should reduce the .exe size to **10MB - 15MB**.
