import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Save, FolderOpen } from 'lucide-react';
import { HexSwitch } from './ui/HexSwitch';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/api/path';
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
    filePath: string;
    onFilePathChange: (path: string) => void;
}

export function CommandManager({ onSend, connected, filePath, onFilePathChange }: CommandManagerProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);
    const [loaded, setLoaded] = useState(false);
    // Track if we have unsaved changes to avoid overwriting on load?
    // Actually, we want auto-save.
    // Issue: If we switch file, we load new commands. 
    // If we modify, we save to current `filePath`.

    // Initial load & Load on filePath change
    useEffect(() => {
        const loadCommands = async () => {
            if (!filePath) return;
            setLoaded(false);
            try {
                // Determine if path is relative or absolute. 
                // Simple heuristic: if it looks like just a filename, use AppConfig.
                // But `filePath` from config should eventually be absolute.
                // However, default is 'commands.yaml'.

                let content = '';
                // Try reading as absolute first
                try {
                    content = await readTextFile(filePath);
                } catch (e) {
                    // If fail, and it's simple filename, try AppConfig
                    // Or if it IS 'commands.yaml', use AppConfig BaseDir
                    if (filePath === 'commands.yaml' || !filePath.includes('/') && !filePath.includes('\\')) {
                        if (await exists(filePath, { baseDir: BaseDirectory.AppConfig })) {
                            content = await readTextFile(filePath, { baseDir: BaseDirectory.AppConfig });
                        } else {
                            // File doesn't exist? Empty list
                            setCommands([]);
                            setLoaded(true);
                            return;
                        }
                    } else {
                        // Absolute path failed?
                        console.error('Failed to read commands file:', e);
                        setCommands([]); // Should we clear or keep previous? Clear is safer to avoid saving to wrong file.
                        setLoaded(true);
                        return;
                    }
                }

                if (content) {
                    const parsed = yaml.load(content) as StoredCommand[];
                    if (Array.isArray(parsed)) {
                        const runtimeCommands = parsed.map(c => ({
                            id: Date.now().toString() + Math.random(),
                            name: c.name || 'Cmd',
                            command: c.command || '',
                            isHex: !!c.isHex
                        }));
                        setCommands(runtimeCommands);
                    } else {
                        setCommands([]);
                    }
                }
            } catch (err) {
                console.error('Failed to load commands:', err);
                setCommands([]);
            } finally {
                setLoaded(true);
            }
        };
        loadCommands();
    }, [filePath]);

    // Debounced Auto-save
    const debouncedCommands = useDebounce(commands, 1000);

    useEffect(() => {
        if (!loaded || !filePath) return;

        const saveCommands = async () => {
            try {
                const toSave: StoredCommand[] = debouncedCommands.map(({ id, ...rest }) => rest);
                const yamlString = yaml.dump(toSave);

                // Same logic for write: absolute vs AppConfig
                if (filePath === 'commands.yaml' || !filePath.includes('/') && !filePath.includes('\\')) {
                    // Ensure dir exists
                    if (!await exists('', { baseDir: BaseDirectory.AppConfig })) {
                        await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
                    }
                    await writeTextFile(filePath, yamlString, { baseDir: BaseDirectory.AppConfig });
                } else {
                    await writeTextFile(filePath, yamlString);
                }
            } catch (err) {
                console.error('Failed to auto-save commands:', err);
            }
        };
        saveCommands();
    }, [debouncedCommands, loaded, filePath]);

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

    const handleSaveAs = async () => {
        try {
            const path = await save({
                filters: [{
                    name: 'YAML Files',
                    extensions: ['yaml', 'yml']
                }],
                defaultPath: filePath || 'commands.yaml'
            });

            if (!path) return;

            // Save current commands to new path
            const toSave: StoredCommand[] = commands.map(({ id, ...rest }) => rest);
            const content = yaml.dump(toSave);
            await writeTextFile(path, content);

            // Switch to new path
            onFilePathChange(path);
        } catch (err) {
            console.error('Failed to save commands as:', err);
        }
    };

    const handleOpen = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'YAML Files',
                    extensions: ['yaml', 'yml']
                }]
            });

            if (selected && typeof selected === 'string') {
                // Switch file path - config will update, triggering usage effect
                onFilePathChange(selected);
            }
        } catch (err) {
            console.error('Failed to open commands file:', err);
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
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="text-xs font-semibold text-muted-foreground">Commands</span>
                    <span className="text-[10px] text-muted-foreground/60 truncate" title={filePath}>
                        {filePath === 'commands.yaml' ? 'Default' : filePath.split(/[/\\]/).pop()}
                    </span>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button onClick={handleAdd} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Add Command">
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-[1px] h-4 bg-border mx-1 self-center" />
                    <button onClick={handleOpen} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Open Command File...">
                        <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleSaveAs} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Save As / Export...">
                        <Save className="w-3.5 h-3.5" />
                    </button>
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
                                className="flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 transition-colors font-medium min-w-0"
                                value={cmd.name}
                                onChange={(e) => updateCommand(cmd.id, 'name', e.target.value)}
                                placeholder="Name"
                            />

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
