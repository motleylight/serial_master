import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn, listen } from '@tauri-apps/api/event';

export type SerialPortInfo = string;

export interface SerialConfig {
    port_name: string;
    baud_rate: number;
    data_bits: number;
    flow_control: string;
    parity: string;
    stop_bits: number;
}

// Helper to check if running in Tauri
const isTauri = () => '__TAURI_INTERNALS__' in window;

export class SerialService {
    static async getPorts(): Promise<SerialPortInfo[]> {
        if (!isTauri()) {
            return ["MOCK_COM1", "MOCK_COM2"];
        }
        return invoke('get_ports');
    }

    static async connect(config: SerialConfig): Promise<void> {
        if (!isTauri()) {
            console.log("Mock Connect:", config);
            return Promise.resolve();
        }
        return invoke('connect', { config });
    }

    static async disconnect(): Promise<void> {
        if (!isTauri()) {
            console.log("Mock Disconnect");
            return Promise.resolve();
        }
        return invoke('disconnect');
    }

    static async send(content: Uint8Array | number[]): Promise<void> {
        if (!isTauri()) {
            console.log("Mock Send:", content);
            return Promise.resolve();
        }
        return invoke('send', { content: Array.from(content) });
    }

    static async listen(callback: (data: Uint8Array) => void): Promise<UnlistenFn> {
        if (!isTauri()) {
            // Mock data intervals
            const interval = setInterval(() => {
                const mockData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
                callback(mockData);
            }, 5000);
            return Promise.resolve(() => clearInterval(interval));
        }
        return listen<number[]>('serial-data', (event) => {
            // Ensure we pass a Uint8Array to the app, as Tauri/serde sends Vec<u8> as number[]
            callback(new Uint8Array(event.payload));
        });
    }
}
