import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Trash2, Plus, Loader2, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { HexSwitch } from './ui/HexSwitch';
import { useScriptRunner } from '../hooks/useScriptRunner';
import { SerialService } from '../services/ipc';

interface CommandGridProps {
    content: string;
    setContent: (val: string) => void;
    onSend: (data: Uint8Array | number[]) => void;
    onLog: (msg: string) => void;
    connected: boolean;
    onAdd?: () => void;
    wordWrap?: 'on' | 'off';
}

interface SavedCommand {
    id: string;
    name: string;
    command: string;
    isHex: boolean;
    isScript?: boolean;
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
    const [isExpanded, setIsExpanded] = useState(false);

    const adjustHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto'; // Reset
            el.style.height = el.scrollHeight + 'px';
        }
    };

    // Auto-resize on content change or wrap mode change (only if expanded/rendered)
    useEffect(() => {
        if (isExpanded || !cmd.isScript) {
            adjustHeight();
        }
    }, [cmd.command, wordWrap, isExpanded, cmd.isScript]);

    // Initial Resize on mount
    useEffect(() => {
        // If it's a script, default is collapsed (no textarea), so no adjustment needed initially for textarea.
        // If not script, default is showing textarea.
        if (!cmd.isScript) adjustHeight();
    }, []);

    return (
        <div className="group flex flex-col gap-1 p-2 border border-border/50 rounded hover:bg-muted/20 text-xs transition-all">
            {/* Top Line */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onSend(cmd)}
                    disabled={!connected && !cmd.isScript}
                    className={`p-1 rounded disabled:opacity-30 disabled:hover:bg-transparent border ${cmd.isScript
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200'
                        : 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200'
                        }`}
                    title={cmd.isScript ? "Run Script" : "Send"}
                >
                    <Play className="w-3 h-3 fill-current" />
                </button>

                <input
                    className="flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 transition-colors font-medium min-w-0"
                    value={cmd.name}
                    onChange={(e) => onUpdate(cmd.id, 'name', e.target.value)}
                    placeholder="Name"
                />

                {cmd.isScript ? (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 text-muted-foreground hover:text-primary rounded"
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                ) : (
                    <HexSwitch
                        checked={cmd.isHex}
                        onChange={(val) => onUpdate(cmd.id, 'isHex', val)}
                    />
                )}

                <button
                    onClick={() => onDelete(cmd.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Bottom Line: Data Content */}
            {(cmd.isScript && !isExpanded) ? (
                <div
                    className="w-full bg-black/5 rounded border border-transparent px-2 py-1.5 font-mono text-[11px] text-blue-600 truncate cursor-pointer hover:bg-black/10 select-none"
                    onClick={() => setIsExpanded(true)}
                    title="Click to expand"
                >
                    {cmd.command.split('\n')[0] || '// Empty Script'} <span className="text-muted-foreground opacity-50 ml-2 text-[9px]">{cmd.command.split('\n').length > 1 ? '...' : ''}</span>
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    className={`w-full bg-black/5 rounded border border-transparent hover:border-border focus:border-primary focus:outline-none px-2 py-1.5 font-mono text-[11px] transition-colors resize-none overflow-hidden ${wordWrap === 'on' ? 'whitespace-pre-wrap' : 'whitespace-pre'} ${cmd.isScript ? 'text-blue-600' : ''}`}
                    value={cmd.command}
                    onChange={(e) => {
                        onUpdate(cmd.id, 'command', e.target.value);
                    }}
                    placeholder={cmd.isScript ? "JavaScript Code..." : (cmd.isHex ? "Hex Data (e.g. AA 55)" : "Text Data")}
                    rows={1}
                    style={{ minHeight: '28px' }}
                    spellCheck={false}
                />
            )}
        </div>
    );
};


export function CommandGrid({ content, setContent, onSend, onLog, connected, onAdd, wordWrap = 'off' }: CommandGridProps) {
    const [commands, setCommands] = useState<SavedCommand[]>([]);

    // --- Script Runner ---
    const { run: runScript, terminate: stopScript, feedData, status: scriptStatus } = useScriptRunner({
        onSend: (data) => {
            if (connected) onSend(data);
        },
        onLog: (msg) => onLog(msg),
        onError: (err) => console.error("Script Error:", err)
    });

    // Listen to incoming data for 'recv'
    useEffect(() => {
        let unlisten: any = null;
        const setup = async () => {
            unlisten = await SerialService.listen((data) => {
                feedData(data);
            });
        };
        setup();
        return () => {
            if (unlisten) unlisten();
        };
    }, [feedData]);


    useEffect(() => {
        const lines = content.split('\n');

        const newItems: SavedCommand[] = [];
        let currentName = 'Cmd';
        let currentScript: string[] = [];
        let inScriptBlock = false;

        const flushScript = () => {
            if (currentScript.length > 0) {
                newItems.push({
                    id: '',
                    name: currentName,
                    command: currentScript.join('\n'),
                    isHex: false,
                    isScript: true
                });
                currentScript = [];
                currentName = 'Cmd';
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Check for Code Block Start/End
            if (trimmed.startsWith('```')) {
                if (inScriptBlock) {
                    // End of block
                    inScriptBlock = false;
                    flushScript();
                } else {
                    // Start of block
                    inScriptBlock = true;
                }
                continue; // Skip the delimiter line
            }

            if (inScriptBlock) {
                currentScript.push(line); // Preserve whitespace inside code block
                continue;
            }

            if (!trimmed) continue;

            if (trimmed.startsWith('#')) {
                currentName = trimmed.replace(/^#+\s*/, '').trim();
            } else {
                let isHex = false;
                let cmdText = trimmed;

                if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 1) {
                    isHex = true;
                    cmdText = trimmed.substring(1, trimmed.length - 1).trim();
                } else if (trimmed.toLowerCase().startsWith('hex:')) {
                    // Legacy fallback just in case
                    isHex = true;
                    cmdText = trimmed.substring(4).trim();
                }

                newItems.push({
                    id: '', // Placeholder
                    name: currentName,
                    command: cmdText,
                    isHex,
                    isScript: false
                });
                currentName = 'Cmd';
            }
        }

        // Check Diff
        let changed = false;
        if (newItems.length !== commands.length) {
            changed = true;
        } else {
            for (let i = 0; i < newItems.length; i++) {
                if (newItems[i].name !== commands[i].name ||
                    newItems[i].command !== commands[i].command ||
                    newItems[i].isHex !== commands[i].isHex ||
                    newItems[i].isScript !== commands[i].isScript) {
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
                oldItem.isHex === newItem.isHex &&
                oldItem.isScript === newItem.isScript) {
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

            // Always include name
            parts.push(`# ${c.name}`);

            if (c.isScript) {
                parts.push('```js');
                parts.push(c.command);
                parts.push('```');
            } else if (c.isHex) {
                parts.push(`*${c.command}*`);
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
        // Scripts: Run via runner
        if (cmd.isScript) {
            // Terminate existing if any? Hook handles restart.
            runScript(cmd.command, commands.map(c => c.isHex ? `*${c.command}*` : c.command));
            return;
        }

        // Normal commands
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
            {/* Global status indicator for scripts */}
            {scriptStatus === 'running' && (
                <div className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded text-xs text-blue-700 mb-2 border border-blue-200">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Script Running...</span>
                    </div>
                    <button onClick={stopScript} className="p-0.5 hover:bg-blue-100 rounded">
                        <Square className="w-3 h-3 fill-current" />
                    </button>
                </div>
            )}

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
