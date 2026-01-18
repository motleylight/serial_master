import { useState, useEffect, useCallback } from 'react';
import { writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { readTextFileWithEncoding } from '../utils/fileUtils';
import { BaseDirectory } from '@tauri-apps/api/path';
import yaml from 'js-yaml';
import { useDebounce } from './useDebounce';

const CONFIG_FILE = 'config.yaml';

export interface ScriptStateConfig {
    type: 'js' | 'external' | null;
    js: string;
    external: string;
}

export interface ScriptConfig {
    tx: ScriptStateConfig;
    rx: ScriptStateConfig;
}

export interface SerialConfig {
    port_name: string;
    baud_rate: number;
    data_bits: number;
    stop_bits: number;
    parity: string;
    flow_control: string;
    timeout: number; // ms
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

export interface UiConfig {
    sidebarVisible: boolean;
    sidebarWidth: number;
    showTimestamp: boolean;
    inputDraft: string;
    inputHistory: string[];
}

export interface FilesConfig {
    commands: string;
}

export interface AppConfig {
    serial: SerialConfig;
    terminal: TerminalConfig;
    send: SendConfig;
    ui: UiConfig;
    files: FilesConfig;
    scripts: ScriptConfig;
}

const DEFAULT_CONFIG: AppConfig = {
    serial: {
        port_name: '',
        baud_rate: 115200,
        data_bits: 8,
        stop_bits: 1,
        parity: 'None',
        flow_control: 'None',
        timeout: 10
    },
    terminal: {
        hexMode: false,
        autoScroll: true,
        wordWrap: false,
    },
    send: {
        hexMode: false,
        appendMode: 'None'
    },
    ui: {
        sidebarVisible: true,
        sidebarWidth: 288,
        showTimestamp: true,
        inputDraft: '',
        inputHistory: []
    },
    files: {
        commands: 'commands.md' // Default relative path
    },
    scripts: {
        tx: { type: null, js: '', external: '' },
        rx: { type: null, js: '', external: '' }
    }
};

export function useAppConfig() {
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [loaded, setLoaded] = useState(false);

    // Initial Load
    useEffect(() => {
        const loadConfig = async () => {
            try {
                // Not strictly needed for Resource, but good practice if supported
                if (!await exists('', { baseDir: BaseDirectory.Resource })) {
                    // Creating root resource dir usually fails/is readonly, but let's try just in case user is in dev
                    // Actually, if we are in dev target/debug/, it might work.
                }

                if (await exists(CONFIG_FILE, { baseDir: BaseDirectory.Resource })) {
                    const content = await readTextFileWithEncoding(CONFIG_FILE, { baseDir: BaseDirectory.Resource });
                    const parsed = yaml.load(content) as any; // Use any to safely merge

                    if (parsed) {
                        setConfig(prev => ({
                            ...prev,
                            ...parsed,
                            serial: { ...prev.serial, ...parsed.serial },
                            terminal: { ...prev.terminal, ...parsed.terminal },
                            send: { ...prev.send, ...parsed.send },
                            ui: { ...prev.ui, ...parsed.ui },
                            files: { ...prev.files, ...parsed.files },
                            scripts: { ...prev.scripts, ...parsed.scripts }
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

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!loaded) return;

        const saveConfig = async () => {
            setSaveStatus('saving');
            setSaveError(null);
            try {
                const yamlString = yaml.dump(debouncedConfig);
                await writeTextFile(CONFIG_FILE, yamlString, { baseDir: BaseDirectory.Resource });
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000); // Reset after 2s
            } catch (err: any) {
                console.error('Failed to save config:', err);
                setSaveStatus('error');
                setSaveError(err?.toString() || 'Unknown error');
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

    const updateUiConfig = useCallback((updates: Partial<UiConfig>) => {
        setConfig(prev => ({
            ...prev,
            ui: { ...prev.ui, ...updates }
        }));
    }, []);

    const updateFilesConfig = useCallback((updates: Partial<FilesConfig>) => {
        setConfig(prev => ({
            ...prev,
            files: { ...prev.files, ...updates }
        }));
    }, []);

    const updateScriptConfig = useCallback((updates: Partial<ScriptConfig>) => {
        setConfig(prev => ({
            ...prev,
            scripts: { ...prev.scripts, ...updates }
        }));
    }, []);





    return {
        config,
        updateSerialConfig,
        updateTerminalConfig,
        updateSendConfig,
        updateUiConfig,
        updateFilesConfig,
        updateScriptConfig,
        loaded,
        saveStatus,
        saveError
    };
}
