import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn, listen } from '@tauri-apps/api/event';

export type SerialPortInfo = string;

// Helper to check if running in Tauri
const isTauri = () => '__TAURI_INTERNALS__' in window;

export class SerialService {
    static async getPorts(): Promise<SerialPortInfo[]> {
        return invoke('get_ports');
    }

    static async connect(portName: string, baudRate: number): Promise<void> {
        return invoke('connect', { portName, baudRate });
    }

    static async disconnect(): Promise<void> {
        return invoke('disconnect');
    }

    static async send(content: string): Promise<void> {
        return invoke('send', { content });
    }

    static async listen(callback: (data: Uint8Array) => void): Promise<UnlistenFn> {
        return listen<number[]>('serial-data', (event) => {
            // Ensure we pass a Uint8Array to the app, as Tauri/serde sends Vec<u8> as number[]
            callback(new Uint8Array(event.payload));
        });
    }
}
