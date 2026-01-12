use serial_master::core::serial_manager::SerialManager;
use tauri::State;
use tokio::sync::Mutex;

// Generic helper to map any error to String
fn to_string_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn get_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports()
        .map_err(|e: serialport::Error| e.to_string())?
        .into_iter()
        .map(|p| p.port_name)
        .collect();
    Ok(ports)
}

#[tauri::command]
pub async fn connect(
    state: State<'_, Mutex<SerialManager>>,
    port_name: String,
    baud_rate: u32,
) -> Result<(), String> {
    let mut manager = state.lock().await;
    manager.open(&port_name, baud_rate).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn disconnect(state: State<'_, Mutex<SerialManager>>) -> Result<(), String> {
    let mut manager = state.lock().await;
    manager.close().map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn send(state: State<'_, Mutex<SerialManager>>, content: String) -> Result<(), String> {
    let manager = state.lock().await;
    // For now treating input as raw string, later handle hex vs ascii based on UI flag if needed.
    // Or let UI convert to bytes. Here let's assume UI sends string for MVP.
    // However, SerialManager::write takes &[u8].
    manager.write(content.as_bytes()).await.map_err(to_string_err)?;
    Ok(())
}
