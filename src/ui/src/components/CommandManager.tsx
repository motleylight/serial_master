import { useState, useRef } from 'react';
import { Plus, Trash2, Play, Save, FolderOpen } from 'lucide-react';
import { HexSwitch } from './ui/HexSwitch';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export interface SavedCommand {
    id: string;
    name: string;
    command: string;
    isHex: boolean;
}

interface CommandManagerProps {
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
}

export function CommandManager({ onSend, connected }: CommandManagerProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                    name: 'JSON Files',
                    extensions: ['json']
                }],
                defaultPath: 'serial_commands.json'
            });

            if (!path) return;

            const content = JSON.stringify(commands, null, 2);
            await writeTextFile(path, content);
        } catch (err) {
            console.error('Failed to export commands:', err);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target?.result as string);
                if (Array.isArray(imported)) {
                    const validated = imported.map((c: any) => ({
                        id: c.id || Date.now().toString() + Math.random(),
                        name: c.name || 'Imported',
                        command: c.command || '',
                        isHex: !!c.isHex,
                    }));
                    setCommands(validated);
                }
            } catch (err) {
                console.error("Failed to parse file", err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
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
                    <button onClick={handleImportClick} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Load Commands">
                        <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleExport} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Save Commands">
                        <Save className="w-3.5 h-3.5" />
                    </button>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".json"
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
