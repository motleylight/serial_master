mod commands;
pub mod scripting;

use serial_master::core::serial_manager::SerialManager;
use serial_master::core::port_sharing_manager::PortSharingManager;
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
        .manage(Mutex::new(PortSharingManager::new()))
        .manage(ScriptManager::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

            // Configure SerialManager with sender
            let state = app.state::<Mutex<SerialManager>>();
            let mut manager = state.blocking_lock();
            manager.set_sender(tx);
            drop(manager); // Release lock

            // Retrieve ScriptManager state (it is managed, so we can get it from app)
            // We use app.state().clone() below directly
            let script_manager = (*app.state::<ScriptManager>()).clone();

            // Spawn event loop
            tauri::async_runtime::spawn(async move {
                while let Some(data) = rx.recv().await {
                    println!("[Backend-Debug] Raw Received {} bytes: {:?}", data.len(), data);
                    
                    // Run Rx Hook
                    let final_data = match script_manager.run_rx_script(data.clone()) {
                        Ok(d) => d,
                        Err(e) => {
                            log::error!("Rx Hook Error: {}", e);
                            // On error, maybe we still emit original? or drop?
                            // Let's log and keep original for safety unless empty
                            data
                        }
                    };

                    // If empty (filtered out), skip emit
                    if final_data.is_empty() {
                         continue;
                    }

                    // Emit event to frontend
                    if let Err(e) = app_handle.emit("serial-data", final_data) {
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
            commands::set_script,
            // 端口共享命令
            commands::check_com0com_installed,
            commands::get_virtual_pairs,
            commands::get_sharing_status,
            commands::enable_port_sharing,
            commands::disable_port_sharing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
