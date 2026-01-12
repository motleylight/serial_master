import { useState, useRef } from 'react';
import { Plus, Trash2, Edit2, Play, Download, Upload, Save } from 'lucide-react';

export interface SavedCommand {
    id: string;
    name: string;
    command: string;
    isHex: boolean;
    interval?: number; // Auto-repeat interval in ms (optional feature)
    description?: string;
}

interface CommandManagerProps {
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
}

export function CommandManager({ onSend, connected }: CommandManagerProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);
    const [editing, setEditing] = useState<string | null>(null);
    const [tempCmd, setTempCmd] = useState<SavedCommand | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAdd = () => {
        const newCmd: SavedCommand = {
            id: Date.now().toString(),
            name: 'New Command',
            command: '',
            isHex: false,
        };
        setCommands([...commands, newCmd]);
        setEditing(newCmd.id);
        setTempCmd(newCmd);
    };

    const handleEdit = (cmd: SavedCommand) => {
        setEditing(cmd.id);
        setTempCmd({ ...cmd });
    };

    const handleSave = () => {
        if (!tempCmd) return;
        setCommands(commands.map(c => c.id === tempCmd.id ? tempCmd : c));
        setEditing(null);
        setTempCmd(null);
    };

    const handleCancel = () => {
        if (editing && !commands.find(c => c.id === editing)?.command && commands.find(c => c.id === editing)?.name === 'New Command') {
            // Remove if it was a new command that was cancelled
            setCommands(commands.filter(c => c.id !== editing));
        }
        setEditing(null);
        setTempCmd(null);
    };

    const handleDelete = (id: string) => {
        setCommands(commands.filter(c => c.id !== id));
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(commands, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "serial_commands.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
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
                    // Basic validation could go here
                    setCommands(imported);
                }
            } catch (err) {
                console.error("Failed to parse file", err);
            }
        };
        reader.readAsText(file);
        // Reset value to allow re-importing same file
        e.target.value = '';
    };

    const executeCommand = (cmd: SavedCommand) => {
        if (!connected) return;

        try {
            let data: Uint8Array;
            if (cmd.isHex) {
                // Parse Hex String "AA BB CC" -> [0xAA, 0xBB, 0xCC]
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
            <div className="flex items-center justify-between p-2 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground">Command List</span>
                <div className="flex gap-1">
                    <button onClick={handleAdd} className="p-1 hover:bg-black/10 rounded" title="Add Command"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={handleImportClick} className="p-1 hover:bg-black/10 rounded" title="Import JSON"><Upload className="w-3.5 h-3.5" /></button>
                    <button onClick={handleExport} className="p-1 hover:bg-black/10 rounded" title="Export JSON"><Download className="w-3.5 h-3.5" /></button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".json"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {commands.map(cmd => (
                    <div key={cmd.id} className="border border-border rounded p-2 flex flex-col gap-2 hover:bg-muted/10">
                        {editing === cmd.id && tempCmd ? (
                            // Edit Mode
                            <div className="flex flex-col gap-2 text-xs">
                                <input
                                    className="border rounded px-1 py-0.5"
                                    value={tempCmd.name}
                                    onChange={e => setTempCmd({ ...tempCmd, name: e.target.value })}
                                    placeholder="Name"
                                />
                                <div className="flex gap-2">
                                    <input
                                        className="border rounded px-1 py-0.5 flex-1 font-mono"
                                        value={tempCmd.command}
                                        onChange={e => setTempCmd({ ...tempCmd, command: e.target.value })}
                                        placeholder="Command Content"
                                    />
                                    <label className="flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={tempCmd.isHex}
                                            onChange={e => setTempCmd({ ...tempCmd, isHex: e.target.checked })}
                                        />
                                        Hex
                                    </label>
                                </div>
                                <div className="flex justify-end gap-2 mt-1">
                                    <button onClick={handleSave} className="bg-primary text-primary-foreground px-2 py-0.5 rounded flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                                    <button onClick={handleCancel} className="bg-muted text-muted-foreground px-2 py-0.5 rounded">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            // View Mode
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-xs truncate">{cmd.name}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono truncate" title={cmd.command}>
                                        {cmd.isHex ? 'HEX: ' : 'TXT: '}{cmd.command}
                                    </div>
                                </div>
                                <div className="flex gap-1 items-center">
                                    <button
                                        onClick={() => executeCommand(cmd)}
                                        disabled={!connected}
                                        className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                        title="Send"
                                    >
                                        <Play className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleEdit(cmd)} className="p-1 hover:bg-black/10 rounded" title="Edit"><Edit2 className="w-3 h-3" /></button>
                                    <button onClick={() => handleDelete(cmd.id)} className="p-1 hover:bg-red-100 text-red-500 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
