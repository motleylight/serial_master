mod commands;
pub mod scripting;

use serial_master::core::serial_manager::SerialManager;
use scripting::ScriptManager;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(SerialManager::new()))
        .manage(ScriptManager::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

            // Configure SerialManager with sender
            let state = app.state::<Mutex<SerialManager>>();
            let mut manager = state.blocking_lock();
            manager.set_sender(tx);
            drop(manager); // Release lock

            // Spawn event loop
            tauri::async_runtime::spawn(async move {
                while let Some(data) = rx.recv().await {
                    // Emit event to frontend
                    println!("[Backend-Debug] Received {} bytes: {:?}", data.len(), data);
                    if let Ok(s) = String::from_utf8(data.clone()) {
                        println!("[Backend-Debug] String content: {}", s);
                    }
                    
                    if let Err(e) = app_handle.emit("serial-data", data) {
                        log::error!("Failed to emit serial-data: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_ports,
            commands::connect,
            commands::disconnect,
            commands::send,
            commands::set_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
