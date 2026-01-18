import serial
import time
import threading
import sys

# Configuration
PORT = "COM9"
BAUD = 115200

def read_from_port(ser):
    """
    Background thread to read from serial port and print to console.
    """
    print(f"[RX-Thread] Listening on {PORT}...")
    while True:
        try:
            if ser.in_waiting > 0:
                # Read line, decode, and strip newline
                try:
                    data = ser.readline().decode('utf-8', errors='replace').strip()
                    if data:
                        print(f"\n[RX] Received: {data}")
                        # print prompt again after receiving
                        # sys.stdout.write("Tx Loop running...\r")
                except Exception as e:
                    print(f"\n[RX-Error] Reading error: {e}")
            else:
                time.sleep(0.01)
        except OSError:
            print("\n[RX-Thread] Port closed or device error.")
            break

def main():
    print(f"--- Bidirectional Serial Test ({PORT}) ---")
    
    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
        print(f"Successfully opened {PORT}.")
    except serial.SerialException as e:
        print(f"Error opening port: {e}")
        return

    # Start Rx Thread
    rx_thread = threading.Thread(target=read_from_port, args=(ser,), daemon=True)
    rx_thread.start()

    counter = 0
    print("Starting Tx Loop (Sending every 1s)... Press Ctrl+C to stop.")
    
    try:
        while True:
            counter += 1
            msg = f"[TEST] Heartbeat #{counter} from Python. This is a very long sentence. This is a very long sentence. This is a very long sentence. This is a very long sentence. This is a very long sentence.\n"
            ser.write(msg.encode('utf-8'))
            # local echo
            # sys.stdout.write(f"\r[TX] Sent: {msg.strip()}   ")
            # sys.stdout.flush()
            
            time.sleep(0.05)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        ser.close()
        print("Port closed.")

if __name__ == "__main__":
    main()
