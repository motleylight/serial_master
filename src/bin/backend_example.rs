use serial_util::core::serial_manager::SerialManager;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("SerialUtil Backend Example");
    println!("=============================");

    // List available ports
    let ports = serialport::available_ports()?;
    println!("Available serial ports:");
    for port in &ports {
        println!("  - {}", port.port_name);
    }

    // Check if COM8 and COM9 are available (for testing)
    let com8_available = ports.iter().any(|p| p.port_name == "COM8");
    let com9_available = ports.iter().any(|p| p.port_name == "COM9");

    println!("\nTest ports availability:");
    println!("  COM8: {}", if com8_available { "Available" } else { "Not found" });
    println!("  COM9: {}", if com9_available { "Available" } else { "Not found" });

    if !com8_available || !com9_available {
        println!("\nNote: For full testing, virtual serial ports COM8 and COM9 are needed.");
        println!("You can create them using tools like com0com or VSPE.");
        return Ok(());
    }

    println!("\n1. Testing SerialManager basic operations...");

    // Create a channel for receiving data
    let (tx, _rx) = mpsc::channel(100);

    // Create and configure SerialManager
    let mut manager = SerialManager::new();
    manager.set_sender(tx);

    println!("2. Opening COM8 at 115200 baud...");
    match manager.open(
        "COM8", 
        115200,
        serialport::DataBits::Eight,
        serialport::FlowControl::None,
        serialport::Parity::None,
        serialport::StopBits::One,
        std::time::Duration::from_millis(100)
    ) {
        Ok(_) => println!("   Successfully opened COM8"),
        Err(e) => {
            println!("   Failed to open COM8: {}", e);
            println!("   This might be due to permission issues or port already in use.");
            return Ok(());
        }
    }

    println!("3. Sending test data...");
    let test_data = b"Hello from SerialUtil backend!";

    match manager.write(test_data).await {
        Ok(_) => println!("   Successfully sent {} bytes", test_data.len()),
        Err(e) => println!("   Failed to send data: {}", e),
    }

    println!("4. Closing port...");
    match manager.close() {
        Ok(_) => println!("   Port closed"),
        Err(e) => println!("   Error closing port: {}", e),
    }

    println!("\nBackend example completed successfully!");
    println!("\nNext steps:");
    println!("- Run 'cargo test' to execute automated tests");
    println!("- Run 'cargo run --bin flood_com9' to simulate data on COM9");
    println!("- Run 'npx tauri dev' to start the full GUI application");

    Ok(())
}
