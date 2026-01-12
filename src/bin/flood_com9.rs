use std::time::Duration;
use std::thread;
use std::io::Write;
use serialport;

fn main() {
    let port_name = "COM9";
    let baud_rate = 115200;

    println!("Opening {} at {}...", port_name, baud_rate);

    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(10))
        .open()
        .expect("Failed to open port");

    println!("Port opened. Starting data flood...");

    let mut counter = 0;
    loop {
        counter += 1;
        let message = format!("[SIM] Data packet #{}, time: {:?}\n", counter, std::time::SystemTime::now());
        
        match port.write_all(message.as_bytes()) {
            Ok(_) => {
                print!("Sent: {}", message);
                // Flush to ensure it's sent
                let _ = port.flush();
            }
            Err(e) => {
                eprintln!("Failed to write: {}", e);
            }
        }

        // Send slightly faster to test scrolling (10ms = 100Hz)
        thread::sleep(Duration::from_millis(50)); 
    }
}
