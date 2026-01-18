import { useState, useEffect } from 'react';
import { Save, FolderOpen, LayoutGrid, FileText, WrapText } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { readTextFileWithEncoding } from '../utils/fileUtils';
import { BaseDirectory } from '@tauri-apps/api/path';
import yaml from 'js-yaml';
import { useDebounce } from '../hooks/useDebounce';
import { CommandEditor } from './CommandEditor';
import { CommandGrid } from './CommandGrid';

// Legacy Types for Migration
interface StoredCommand {
    name: string;
    command: string;
    isHex: boolean;
}

interface CommandManagerProps {
    onSend: (data: Uint8Array | number[]) => void;
    onLog: (msg: string) => void;
    connected: boolean;
    filePath: string;
    onFilePathChange: (path: string) => void;
}

export function CommandManager({ onSend, onLog, connected, filePath, onFilePathChange }: CommandManagerProps) {
    const [content, setContent] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [viewMode, setViewMode] = useState<'editor' | 'grid'>('grid');
    const [wordWrap, setWordWrap] = useState<'on' | 'off'>('off');

    // --- File Loading & Migration ---
    useEffect(() => {
        const loadCommands = async () => {
            if (!filePath) return;
            setLoaded(false);
            try {
                let fileContent = '';
                try {
                    fileContent = await readTextFileWithEncoding(filePath);
                } catch (e) {
                    if (filePath === 'commands.md' || filePath === 'commands.txt' || (!filePath.includes('/') && !filePath.includes('\\'))) {
                        if (await exists(filePath, { baseDir: BaseDirectory.AppConfig })) {
                            fileContent = await readTextFileWithEncoding(filePath, { baseDir: BaseDirectory.AppConfig });
                        } else {
                            setContent('');
                            setLoaded(true);
                            return;
                        }
                    } else {
                        // console.error('Failed to read commands file:', e);
                        setLoaded(true);
                        return;
                    }
                }

                // Auto-Migrate Legacy YAML/JSON to Markdown
                if (fileContent.trim().startsWith('-') || fileContent.trim().startsWith('[')) {
                    try {
                        const parsed = yaml.load(fileContent) as StoredCommand[];
                        if (Array.isArray(parsed)) {
                            const migrated = parsed.map(c => {
                                const lines = [];
                                if (c.name && c.name !== 'Cmd') lines.push(`# ${c.name}`);
                                if (c.isHex) {
                                    lines.push(`*${c.command}*`);
                                } else {
                                    lines.push(c.command);
                                }
                                return lines.join('\n');
                            }).join('\n\n');
                            setContent(migrated);
                        } else {
                            setContent(fileContent);
                        }
                    } catch {
                        setContent(fileContent);
                    }
                } else {
                    setContent(fileContent);
                }

            } catch (err) {
                console.error('Failed to load commands:', err);
                setContent('');
            } finally {
                setLoaded(true);
            }
        };
        loadCommands();
    }, [filePath]);


    // --- Auto-Save ---
    const debouncedContent = useDebounce(content, 1000);
    useEffect(() => {
        if (!loaded || !filePath) return;

        const saveFile = async () => {
            try {
                if (filePath === 'commands.md' || filePath === 'commands.txt' || (!filePath.includes('/') && !filePath.includes('\\'))) {
                    // Try to Create Dir blindly
                    try {
                        await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
                    } catch (e) { /* ignore */ }

                    await writeTextFile(filePath, debouncedContent, { baseDir: BaseDirectory.AppConfig });
                } else {
                    await writeTextFile(filePath, debouncedContent);
                }
            } catch (err) {
                console.error('Failed to auto-save commands:', err);
            }
        };
        saveFile();
    }, [debouncedContent, loaded, filePath]);


    // --- Handlers ---
    const handleAdd = () => {
        setContent(prev => {
            const prefix = prev.trim() ? '\n\n' : '';
            return prev + prefix + '# New Command\ncommand_here';
        });
    };

    const handleOpen = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Command Files',
                    extensions: ['md', 'txt', 'yaml', 'yml', 'log']
                }]
            });
            if (selected && typeof selected === 'string') {
                onFilePathChange(selected);
            }
        } catch (err) {
            console.error('Failed to open file:', err);
        }
    };

    const handleSaveAs = async () => {
        try {
            const path = await save({
                filters: [{
                    name: 'Markdown File',
                    extensions: ['md']
                }, {
                    name: 'Text File',
                    extensions: ['txt']
                }],
                defaultPath: filePath.replace(/\.(yaml|yml|txt)$/, '.md') || 'commands.md'
            });

            if (!path) return;

            await writeTextFile(path, content);
            onFilePathChange(path);
        } catch (err) {
            console.error('Failed to save as:', err);
        }
    };

    return (
        <div className="flex flex-col h-full border border-border/40 rounded-md bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-2 bg-muted/50 border-b border-border">
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="text-xs font-semibold text-muted-foreground">Commands</span>
                    <span className="text-[10px] text-muted-foreground/60 truncate" title={filePath}>
                        {filePath.split(/[/\\]/).pop()}
                    </span>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => setWordWrap(w => w === 'on' ? 'off' : 'on')}
                        className={`p-1 rounded border border-transparent ${wordWrap === 'on' ? 'bg-white shadow-sm text-primary' : 'hover:bg-black/10'}`}
                        title="Toggle Word Wrap"
                    >
                        <WrapText className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-4 bg-border mx-1 self-center" />

                    {/* View Switcher */}
                    <div className="flex bg-muted rounded p-0.5 mr-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1 rounded text-[10px] flex items-center gap-1 ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setViewMode('editor')}
                            className={`p-1 rounded text-[10px] flex items-center gap-1 ${viewMode === 'editor' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Editor View"
                        >
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="w-[1px] h-4 bg-border mx-1 self-center" />

                    <button onClick={handleOpen} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Open File...">
                        <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleSaveAs} className="p-1 hover:bg-black/10 rounded border border-transparent hover:border-border" title="Save As...">
                        <Save className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 relative">
                {viewMode === 'editor' ? (
                    <CommandEditor
                        content={content}
                        setContent={setContent}
                        onSend={onSend}
                        onLog={onLog}
                        connected={connected}
                        wordWrap={wordWrap}
                    />
                ) : (
                    <CommandGrid
                        content={content}
                        setContent={setContent}
                        onSend={onSend}
                        onLog={onLog}
                        connected={connected}
                        onAdd={handleAdd}
                        wordWrap={wordWrap}
                    />
                )}
            </div>
        </div>
    );
}
