use anyhow::{Result, Context};
use serial_util::core::serial_manager::SerialManager;
use std::time::Duration;
use tokio::time::sleep;
use serialport;

// CONSTANTS for virtual ports
const WRITER_PORT: &str = "COM8";
const READER_PORT: &str = "COM9";
const BAUD_RATE: u32 = 115200;

#[tokio::test]
async fn test_loopback_integrity() -> Result<()> {
    // 0. Ensure ports are available (simple check)
    let available_ports = serialport::available_ports()?;
    let has_writer = available_ports.iter().any(|p| p.port_name == WRITER_PORT);
    let has_reader = available_ports.iter().any(|p| p.port_name == READER_PORT);

    if !has_writer || !has_reader {
        println!("Skipping test: Virtual ports {}/{} not found.", WRITER_PORT, READER_PORT);
        return Ok(());
    }

    // 1. Setup Reader (Receiver)
    // For this simple test utilizing SerialManager, we will just open it and use the raw port 
    // inside the manager or checking functionality via side-channels if we haven't exposed read yet.
    // However, SerialManager currently only has open/write. 
    // To properly test loopback, we need a way to READ. 
    // Since SerialManager doesn't expose Read yet (it just has a placeholder event loop), 
    // we might need to open the Reader port MANUALLY using serialport-rs directly for verification, 
    // while using SerialManager for the Writer.
    
    // Open Reader manually
    let mut reader = serialport::new(READER_PORT, BAUD_RATE)
        .timeout(Duration::from_millis(1000))
        .open()
        .context("Failed to open reader port manually")?;

    // 2. Setup Writer (System Under Test)
    let mut manager = SerialManager::new();
    manager.open(
        WRITER_PORT, 
        BAUD_RATE,
        serialport::DataBits::Eight,
        serialport::FlowControl::None,
        serialport::Parity::None,
        serialport::StopBits::One,
        Duration::from_millis(100)
    ).context("Failed to open writer port via Manager")?;

    // 3. Test Data
    let test_payload = b"Hello SerialUtil Phase0";
    
    // 4. Send Data
    manager.write(test_payload).await.context("Failed to write data")?;

    // 5. Verify Receipt
    let mut param_buf = vec![0u8; test_payload.len()];
    reader.read_exact(&mut param_buf).context("Failed to read data from loopback")?;

    assert_eq!(&param_buf, test_payload, "Loopback data mismatch");
    
    // 6. Cleanup
    manager.close()?;
    
    Ok(())
}

#[tokio::test]
async fn test_stress_write() -> Result<()> {
     // 0. Check ports
    let available_ports = serialport::available_ports()?;
    if !available_ports.iter().any(|p| p.port_name == WRITER_PORT) || 
       !available_ports.iter().any(|p| p.port_name == READER_PORT) {
        return Ok(());
    }

    let mut reader = serialport::new(READER_PORT, BAUD_RATE)
        .timeout(Duration::from_millis(5000))
        .open()?;

    let mut manager = SerialManager::new();
    manager.open(
        WRITER_PORT, 
        BAUD_RATE,
        serialport::DataBits::Eight,
        serialport::FlowControl::None,
        serialport::Parity::None,
        serialport::StopBits::One,
        Duration::from_millis(100)
    )?;

    // Send 100 fast packets
    for i in 0..100 {
        let msg = format!("MSG:{:04}", i);
        manager.write(msg.as_bytes()).await?;
        
        let mut buf = vec![0u8; msg.len()];
        reader.read_exact(&mut buf)?;
        assert_eq!(buf, msg.as_bytes());
    }

    Ok(())
}
