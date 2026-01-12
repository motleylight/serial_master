import serial
import time
import sys

def main():
    port = "COM9"
    baud = 115200
    
    print(f"Attempting to open {port} at {baud}...")
    
    try:
        # Timeout 0 for non-blocking write logic if needed, but 1s is fine for simple loop
        ser = serial.Serial(port, baud, timeout=1)
        print(f"Successfully opened {port}.")
        
        counter = 0
        while True:
            counter += 1
            # Simulate a log format
            timestamp = time.strftime("%H:%M:%S")
            msg = f"[SIM] Data Packet #{counter} at {timestamp} | Temp: {25 + (counter%10)*0.5:.1f}C\n"
            
            ser.write(msg.encode('utf-8'))
            # Print to console so user sees it's working
            # Use sys.stdout.write to be snappier? print is fine.
            print(f"Tx: {msg.strip()}")
            
            # 50ms = 20 messages per second (approx)
            time.sleep(0.05)
            
    except serial.SerialException as e:
        print(f"Error: {e}")
        print("Tip: Make sure COM9 exists (is paired with COM8) and is not open in another program.")
    except KeyboardInterrupt:
        print("\nStopped by user.")
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    main()
