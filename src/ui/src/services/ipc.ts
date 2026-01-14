import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn, listen } from '@tauri-apps/api/event';

export interface SerialPortInfo {
    port_name: string;
    product_name?: string;
}

export type SerialPortConfig = SerialConfig; // Alias for compatibility if needed

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

// Mock state
let mockConnected = false;

export class SerialService {
    static async getPorts(): Promise<SerialPortInfo[]> {
        if (!isTauri()) {
            return [
                { port_name: "COM3", product_name: "Mock Device A" },
                { port_name: "COM9", product_name: "Mock Device B" }
            ];
        }
        return invoke('get_ports');
    }

    static async connect(config: SerialConfig): Promise<void> {
        if (!isTauri()) {
            console.log("Mock Connect:", config);
            mockConnected = true;
            return Promise.resolve();
        }
        return invoke('connect', { config });
    }

    static async disconnect(): Promise<void> {
        if (!isTauri()) {
            console.log("Mock Disconnect");
            mockConnected = false;
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
                if (mockConnected) {
                    const mockData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
                    callback(mockData);
                }
            }, 1000);
            return Promise.resolve(() => clearInterval(interval));
        }
        return listen<number[]>('serial-data', (event) => {
            // Ensure we pass a Uint8Array to the app, as Tauri/serde sends Vec<u8> as number[]
            callback(new Uint8Array(event.payload));
        });
    }
}

// ============== 端口共享服务 ==============

export interface PortPair {
    pair_id: number;
    port_a: string;
    port_b: string;
}

export interface SharingStatus {
    enabled: boolean;
    port_pair: PortPair | null;
    external_port: string | null;
}

export class PortSharingService {
    /**
     * 检测 com0com 是否已安装
     */
    static async isCom0comInstalled(): Promise<boolean> {
        if (!isTauri()) {
            return false; // Mock: 未安装
        }
        return invoke('check_com0com_installed');
    }

    /**
     * 获取虚拟端口对列表
     */
    static async getVirtualPairs(): Promise<PortPair[]> {
        if (!isTauri()) {
            return []; // Mock: 空列表
        }
        return invoke('get_virtual_pairs');
    }

    /**
     * 获取当前共享状态
     */
    static async getSharingStatus(): Promise<SharingStatus> {
        if (!isTauri()) {
            return { enabled: false, port_pair: null, external_port: null };
        }
        return invoke('get_sharing_status');
    }

    /**
     * 启用端口共享模式
     * @param physicalPort 当前连接的物理端口名
     * @returns 供其他软件使用的虚拟端口名
     */
    static async enableSharing(physicalPort: string): Promise<string> {
        if (!isTauri()) {
            return "COM99"; // Mock 返回
        }
        return invoke('enable_port_sharing', { physicalPort });
    }

    /**
     * 禁用端口共享模式
     */
    static async disableSharing(): Promise<void> {
        if (!isTauri()) {
            return;
        }
        return invoke('disable_port_sharing');
    }
}

