import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Play, Save, FolderOpen } from 'lucide-react';
import { HexSwitch } from './ui/HexSwitch';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile, BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import yaml from 'js-yaml';
import { useDebounce } from '../hooks/useDebounce';

// Runtime command structure (includes ID for React keys)
export interface SavedCommand {
    id: string;
    name: string;
    command: string;
    isHex: boolean;
}

// Storage command structure (no ID)
interface StoredCommand {
    name: string;
    command: string;
    isHex: boolean;
}

interface CommandManagerProps {
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
}

const COMMANDS_FILE = 'commands.yaml';

export function CommandManager({ onSend, connected }: CommandManagerProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);
    const [loaded, setLoaded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial load
    useEffect(() => {
        const loadCommands = async () => {
            try {
                // Ensure AppConfig directory exists
                const configExists = await exists('', { baseDir: BaseDirectory.AppConfig });
                if (!configExists) {
                    await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
                }

                const fileExists = await exists(COMMANDS_FILE, { baseDir: BaseDirectory.AppConfig });
                if (fileExists) {
                    const content = await readTextFile(COMMANDS_FILE, { baseDir: BaseDirectory.AppConfig });
                    const parsed = yaml.load(content) as StoredCommand[];

                    if (Array.isArray(parsed)) {
                        const runtimeCommands = parsed.map(c => ({
                            id: Date.now().toString() + Math.random(),
                            name: c.name || 'Cmd',
                            command: c.command || '',
                            isHex: !!c.isHex
                        }));
                        setCommands(runtimeCommands);
                    }
                }
            } catch (err) {
                console.error('Failed to load commands:', err);
            } finally {
                setLoaded(true);
            }
        };
        loadCommands();
    }, []);

    // Debounced Auto-save
    const debouncedCommands = useDebounce(commands, 1000);

    useEffect(() => {
        if (!loaded) return;

        const saveCommands = async () => {
            try {
                // Convert back to stored format (remove IDs)
                const toSave: StoredCommand[] = debouncedCommands.map(({ id, ...rest }) => rest);
                const yamlString = yaml.dump(toSave);

                await writeTextFile(COMMANDS_FILE, yamlString, { baseDir: BaseDirectory.AppConfig });
            } catch (err) {
                console.error('Failed to auto-save commands:', err);
            }
        };
        saveCommands();
    }, [debouncedCommands, loaded]);

    const handleAdd = () => {
        const newCmd: SavedCommand = {
            id: Date.now().toString(),
            name: 'Cmd',
            command: '',
            isHex: false,
        };
        setCommands([...commands, newCmd]);
    };

    const updateCommand = (id: string, field: keyof SavedCommand, value: any) => {
        setCommands(commands.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleDelete = (id: string) => {
        setCommands(commands.filter(c => c.id !== id));
    };

    const handleExport = async () => {
        try {
            const path = await save({
                filters: [{
                    name: 'YAML Files',
                    extensions: ['yaml', 'yml']
                }],
                defaultPath: 'serial_commands.yaml'
            });

            if (!path) return;

            const toSave: StoredCommand[] = commands.map(({ id, ...rest }) => rest);
            const content = yaml.dump(toSave);
            await writeTextFile(path, content);
        } catch (err) {
            console.error('Failed to export commands:', err);
        }
    };

    const handleImportClick = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'YAML/JSON Files',
                    extensions: ['yaml', 'yml', 'json']
                }]
            });

            if (selected && typeof selected === 'string') {
                const content = await readTextFile(selected);
                let imported: any;

                if (selected.endsWith('.json')) {
                    imported = JSON.parse(content);
                } else {
                    imported = yaml.load(content);
                }

                if (Array.isArray(imported)) {
                    const validated = imported.map((c: any) => ({
                        id: c.id || Date.now().toString() + Math.random(),
                        name: c.name || 'Imported',
                        command: c.command || '',
                        isHex: !!c.isHex,
                    }));

                    // Option to merge or replace? Let's append for safety or replace? 
                    // Usually import implies loading a set. Let's append to avoid losing current work unless user clears.
                    // Or typically "Load" might replace. Let's Append.
                    setCommands(prev => [...prev, ...validated]);
                }
            }
        } catch (err) {
            console.error('Failed to import commands:', err);
        }
    };

    const executeCommand = (cmd: SavedCommand) => {
        if (!connected) return;

        try {
            let data: Uint8Array;
            if (cmd.isHex) {
                const cleanHex = cmd.command.replace(/[^0-9A-Fa-f]/g, '');
                if (cleanHex.length % 2 !== 0) {
                    console.error("Invalid Hex String");
                    return;
                }
                const bytes = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) {
                    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
                }
                data = bytes;
            } else {
                data = new TextEncoder().encode(cmd.command);
            }
            onSend(data);
        } catch (e) {
            console.error("Command Execution Error", e);
        }
    };

    return (
        <div className="flex flex-col h-full border border-border/40 rounded-md bg-white shadow-sm overflow-hidden">
            {/* Header / Global Controls */}
            <div className="flex items-center justify-between p-2 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground">Commands</span>
                <div className="flex gap-1">
                    <button onClick={handleAdd} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Add Command">
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-[1px] h-4 bg-border mx-1 self-center" />
                    <button onClick={handleImportClick} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Import Commands (YAML/JSON)">
                        <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleExport} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Export Commands (YAML)">
                        <Save className="w-3.5 h-3.5" />
                    </button>

                    {/* Input ref no longer needed with plugin-dialog but kept if we revert */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                    />
                </div>
            </div>

            {/* Command List - Editable Rows */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {commands.map(cmd => (
                    <div key={cmd.id} className="group flex flex-col gap-1 p-2 border border-border/50 rounded hover:bg-muted/20 text-xs">
                        {/* Top Line: Send | Name | Hex | Delete */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => executeCommand(cmd)}
                                disabled={!connected}
                                className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100 disabled:opacity-30 disabled:hover:bg-transparent border border-green-200"
                                title="Send"
                            >
                                <Play className="w-3 h-3 fill-current" />
                            </button>

                            <input
                                className="w-24 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 truncate transition-colors font-medium"
                                value={cmd.name}
                                onChange={(e) => updateCommand(cmd.id, 'name', e.target.value)}
                                placeholder="Name"
                            />

                            <div className="flex-1" /> {/* Spacer */}

                            <HexSwitch
                                checked={cmd.isHex}
                                onChange={(val) => updateCommand(cmd.id, 'isHex', val)}
                            />

                            <button
                                onClick={() => handleDelete(cmd.id)}
                                className="p-1 text-muted-foreground hover:text-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Bottom Line: Data Content (Full Width) */}
                        <input
                            className="w-full bg-black/5 rounded border border-transparent hover:border-border focus:border-primary focus:outline-none px-2 py-1 font-mono text-[11px] transition-colors"
                            value={cmd.command}
                            onChange={(e) => updateCommand(cmd.id, 'command', e.target.value)}
                            placeholder={cmd.isHex ? "Hex Data (e.g. AA 55)" : "Text Data"}
                        />
                    </div>
                ))}

                {commands.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground opacity-50 text-xs">
                        No commands. Click + to add.
                    </div>
                )}
            </div>
        </div>
    );
}
