use serial_util::core::serial_manager::SerialManager;

#[tokio::main]
async fn main() {
    println!("Testing SerialUtil backend...");

    // Try to list available ports
    match serialport::available_ports() {
        Ok(ports) => {
            println!("Available serial ports:");
            for port in ports {
                println!("  - {}", port.port_name);
            }
        }
        Err(e) => {
            println!("Failed to list ports: {}", e);
        }
    }

    // Test SerialManager creation
    let _manager = SerialManager::new();
    println!("SerialManager created successfully!");

    // Note: Without virtual serial ports, we can't test open/write
    // This is just to verify the library loads and basic types work
    println!("Backend test completed.");
}
