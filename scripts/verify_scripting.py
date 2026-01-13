import serial
import time
import sys

PORT = "COM9"
BAUD = 115200

def main():
    print(f"Opening {PORT} to verify scripting...")
    try:
        with serial.Serial(PORT, BAUD, timeout=3) as ser:
            print(f"Listening on {PORT}...")
            print("Ready to receive modified data.")
            while True:
                if ser.in_waiting:
                    data = ser.read_all()
                    print(f"RECEIVED_RAW: {data}")
                    print(f"RECEIVED_HEX: {data.hex()}")
                    print(f"RECEIVED_TEXT: {data.decode(errors='replace')}")
                time.sleep(0.1)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
