$env:CARGO_TARGET_DIR = "$env:TEMP\serial_util_target"
Write-Host "Setting build target to: $env:CARGO_TARGET_DIR"
Write-Host "Starting SerialUtil..."

cd src/tauri
cargo run
