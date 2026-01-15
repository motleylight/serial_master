import { useState, useEffect, useCallback } from 'react';
import { readTextFile, writeTextFile, BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import yaml from 'js-yaml';
import { useDebounce } from './useDebounce';

const CONFIG_FILE = 'config.yaml';

export interface SerialConfig {
    port_name: string;
    baud_rate: number;
    data_bits: number;
    stop_bits: number;
    parity: string;
    flow_control: string;
}

export interface TerminalConfig {
    hexMode: boolean; // Receive Hex
    autoScroll: boolean;
    wordWrap: boolean;
}

export interface SendConfig {
    hexMode: boolean; // Send Hex
    appendMode: 'None' | 'CR' | 'LF' | 'CRLF';
}

export interface AppConfig {
    serial: SerialConfig;
    terminal: TerminalConfig;
    send: SendConfig;
}

const DEFAULT_CONFIG: AppConfig = {
    serial: {
        port_name: '',
        baud_rate: 115200,
        data_bits: 8,
        stop_bits: 1,
        parity: 'None',
        flow_control: 'None'
    },
    terminal: {
        hexMode: false,
        autoScroll: true,
        wordWrap: false,
    },
    send: {
        hexMode: false,
        appendMode: 'None'
    }
};

export function useAppConfig() {
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [loaded, setLoaded] = useState(false);

    // Initial Load
    useEffect(() => {
        const loadConfig = async () => {
            try {
                // Ensure AppConfig dir exists
                if (!await exists('', { baseDir: BaseDirectory.AppConfig })) {
                    await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
                }

                if (await exists(CONFIG_FILE, { baseDir: BaseDirectory.AppConfig })) {
                    const content = await readTextFile(CONFIG_FILE, { baseDir: BaseDirectory.AppConfig });
                    const parsed = yaml.load(content) as any; // Use any to safely merge

                    if (parsed) {
                        setConfig(prev => ({
                            ...prev,
                            ...parsed,
                            serial: { ...prev.serial, ...parsed.serial },
                            terminal: { ...prev.terminal, ...parsed.terminal },
                            send: { ...prev.send, ...parsed.send }
                        }));
                    }
                }
            } catch (err) {
                console.error('Failed to load config:', err);
            } finally {
                setLoaded(true);
            }
        };
        loadConfig();
    }, []);

    // Auto-save
    const debouncedConfig = useDebounce(config, 1000);

    useEffect(() => {
        if (!loaded) return;

        const saveConfig = async () => {
            try {
                const yamlString = yaml.dump(debouncedConfig);
                await writeTextFile(CONFIG_FILE, yamlString, { baseDir: BaseDirectory.AppConfig });
            } catch (err) {
                console.error('Failed to save config:', err);
            }
        };
        saveConfig();
    }, [debouncedConfig, loaded]);

    const updateSerialConfig = useCallback((updates: Partial<SerialConfig>) => {
        setConfig(prev => ({
            ...prev,
            serial: { ...prev.serial, ...updates }
        }));
    }, []);

    const updateTerminalConfig = useCallback((updates: Partial<TerminalConfig>) => {
        setConfig(prev => ({
            ...prev,
            terminal: { ...prev.terminal, ...updates }
        }));
    }, []);

    const updateSendConfig = useCallback((updates: Partial<SendConfig>) => {
        setConfig(prev => ({
            ...prev,
            send: { ...prev.send, ...updates }
        }));
    }, []);

    return {
        config,
        updateSerialConfig,
        updateTerminalConfig,
        updateSendConfig,
        loaded
    };
}
