$env:CARGO_TARGET_DIR = "$env:TEMP\serial_master_target"
Write-Host "Setting build target to: $env:CARGO_TARGET_DIR"
Write-Host "Starting SerialMaster..."

cd src/tauri
cargo run
