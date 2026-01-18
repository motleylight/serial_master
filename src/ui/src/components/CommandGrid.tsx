import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Trash2, Plus } from 'lucide-react';
import { HexSwitch } from './ui/HexSwitch';

interface CommandGridProps {
    content: string;
    setContent: (val: string) => void;
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
    onAdd?: () => void;
    wordWrap?: 'on' | 'off';
}

interface SavedCommand {
    id: string;
    name: string;
    command: string;
    isHex: boolean;
}

// Sub-component for individual card logic (Textarea resizing)
const CommandItem = ({
    cmd,
    onUpdate,
    onDelete,
    onSend,
    connected,
    wordWrap
}: {
    cmd: SavedCommand;
    onUpdate: (id: string, field: keyof SavedCommand, val: any) => void;
    onDelete: (id: string) => void;
    onSend: (cmd: SavedCommand) => void;
    connected: boolean;
    wordWrap: 'on' | 'off';
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto'; // Reset
            el.style.height = el.scrollHeight + 'px';
        }
    };

    // Auto-resize on content change or wrap mode change
    useEffect(() => {
        adjustHeight();
    }, [cmd.command, wordWrap]);

    // Initial Resize on mount
    useEffect(() => {
        adjustHeight();
    }, []);

    return (
        <div className="group flex flex-col gap-1 p-2 border border-border/50 rounded hover:bg-muted/20 text-xs">
            {/* Top Line */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onSend(cmd)}
                    disabled={!connected}
                    className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100 disabled:opacity-30 disabled:hover:bg-transparent border border-green-200"
                    title="Send"
                >
                    <Play className="w-3 h-3 fill-current" />
                </button>

                <input
                    className="flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 transition-colors font-medium min-w-0"
                    value={cmd.name}
                    onChange={(e) => onUpdate(cmd.id, 'name', e.target.value)}
                    placeholder="Name"
                />

                <HexSwitch
                    checked={cmd.isHex}
                    onChange={(val) => onUpdate(cmd.id, 'isHex', val)}
                />

                <button
                    onClick={() => onDelete(cmd.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Bottom Line: Data Content */}
            <textarea
                ref={textareaRef}
                className={`w-full bg-black/5 rounded border border-transparent hover:border-border focus:border-primary focus:outline-none px-2 py-1.5 font-mono text-[11px] transition-colors resize-none overflow-hidden ${wordWrap === 'on' ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}
                value={cmd.command}
                onChange={(e) => {
                    onUpdate(cmd.id, 'command', e.target.value);
                }}
                placeholder={cmd.isHex ? "Hex Data (e.g. AA 55)" : "Text Data"}
                rows={1}
                style={{ minHeight: '28px' }}
                spellCheck={false}
            />
        </div>
    );
};


export function CommandGrid({ content, setContent, onSend, connected, onAdd, wordWrap = 'off' }: CommandGridProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);

    useEffect(() => {
        const lines = content.split('\n');

        const newItems: SavedCommand[] = [];
        let currentName = 'Cmd';
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (trimmed.startsWith('#')) {
                currentName = trimmed.substring(1).trim();
            } else {
                let isHex = false;
                let cmdText = trimmed;
                if (trimmed.toLowerCase().startsWith('hex:')) {
                    isHex = true;
                    cmdText = trimmed.substring(4).trim();
                }
                newItems.push({
                    id: '', // Placeholder
                    name: currentName,
                    command: cmdText,
                    isHex
                });
                currentName = 'Cmd';
            }
        });

        // Check Diff
        let changed = false;
        if (newItems.length !== commands.length) {
            changed = true;
        } else {
            for (let i = 0; i < newItems.length; i++) {
                if (newItems[i].name !== commands[i].name ||
                    newItems[i].command !== commands[i].command ||
                    newItems[i].isHex !== commands[i].isHex) {
                    changed = true;
                    break;
                }
            }
        }

        if (!changed) return;

        const preservedItems = newItems.map((newItem, i) => {
            const oldItem = commands[i];
            if (oldItem &&
                oldItem.name === newItem.name &&
                oldItem.command === newItem.command &&
                oldItem.isHex === newItem.isHex) {
                return { ...newItem, id: oldItem.id };
            }
            return { ...newItem, id: Math.random().toString(36).substr(2, 9) };
        });

        setCommands(preservedItems);
    }, [content]);


    // --- Serialization ---
    const updateContent = useCallback((newCommands: SavedCommand[]) => {
        const textParam = newCommands.map(c => {
            const parts = [];

            // Always include name, even if empty, to prevent parser from using default 'Cmd'
            parts.push(`# ${c.name}`);

            if (c.isHex) {
                parts.push(`HEX: ${c.command}`);
            } else {
                parts.push(c.command);
            }
            return parts.join('\n');
        }).join('\n\n');

        setContent(textParam);
    }, [setContent]);


    const updateCommand = (id: string, field: keyof SavedCommand, value: any) => {
        const newCommands = commands.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        );
        setCommands(newCommands);
        updateContent(newCommands);
    };

    const handleDelete = (id: string) => {
        const newCommands = commands.filter(c => c.id !== id);
        setCommands(newCommands);
        updateContent(newCommands);
    };

    const executeCommand = (cmd: SavedCommand) => {
        if (!connected) return;
        try {
            let data: Uint8Array;
            if (cmd.isHex) {
                const cleanHex = cmd.command.replace(/[^0-9A-Fa-f]/g, '');
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
        <div className="h-full overflow-y-auto p-2 space-y-1">
            {commands.map(cmd => (
                <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    onUpdate={updateCommand}
                    onDelete={handleDelete}
                    onSend={executeCommand}
                    connected={connected}
                    wordWrap={wordWrap}
                />
            ))}

            <div className="pt-2 pb-8">
                <button
                    onClick={onAdd}
                    className="flex items-center justify-center w-full py-2 border-2 border-dashed border-border/60 hover:border-primary/50 rounded-md text-muted-foreground hover:text-primary transition-colors gap-2"
                >
                    <Plus className="w-4 h-4" />
                    <span className="text-xs font-medium">Add Command</span>
                </button>
            </div>
        </div>
    );
}
