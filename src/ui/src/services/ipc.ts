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
    timeout?: number; // ms
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
    port_pairs: PortPair[];
    physical_port: string | null;
}

export class PortSharingService {
    /**
     * 检测 com0com 是否已安装
     */
    static async isCom0comInstalled(): Promise<boolean> {
        if (!isTauri()) {
            return false;
        }
        return invoke('check_com0com_installed');
    }



    /**
     * 获取虚拟端口对列表
     */
    static async getVirtualPairs(): Promise<PortPair[]> {
        if (!isTauri()) {
            return [];
        }
        return invoke('get_virtual_pairs');
    }

    /**
     * 创建虚拟端口对
     */
    static async createVirtualPair(nameA: string, nameB: string): Promise<PortPair> {
        if (!isTauri()) {
            return { pair_id: 99, port_a: "MOCK_A", port_b: "MOCK_B" };
        }
        return invoke('create_virtual_pair', { nameA, nameB });
    }

    /**
     * 移除虚拟端口对
     */
    static async removeVirtualPair(pairId: number): Promise<void> {
        if (!isTauri()) {
            return;
        }
        return invoke('remove_virtual_pair', { pairId });
    }

    /**
     * 重命名虚拟端口对
     */
    static async renameVirtualPair(pairId: number, nameA: string, nameB: string): Promise<void> {
        if (!isTauri()) {
            return;
        }
        return invoke('rename_virtual_pair', { pairId, nameA, nameB });
    }

    /**
     * 获取当前共享状态
     */
    static async getSharingStatus(): Promise<SharingStatus> {
        if (!isTauri()) {
            return { enabled: false, port_pairs: [], physical_port: null };
        }
        return invoke('get_sharing_status');
    }

    /**
     * 启用端口共享模式
     * @param physicalPort 当前连接的物理端口名
     * @param virtualPairIds 选中的虚拟端口对ID列表
     */
    static async startSharing(physicalPort: string, virtualPairIds: number[], baudRate?: number): Promise<void> {
        if (!isTauri()) {
            return;
        }
        return invoke('start_port_sharing', { physicalPort, virtualPairIds, baudRate });
    }

    /**
     * 禁用端口共享模式
     */
    static async stopSharing(): Promise<void> {
        if (!isTauri()) {
            return;
        }
        return invoke('stop_port_sharing');
    }
}

