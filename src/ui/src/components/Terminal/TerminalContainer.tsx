import { useRef, useEffect, useState } from 'react';
import { type LogData, LogEntry, type ViewMode } from './LogEntry';
import { cn } from '../../lib/utils';
import { ArrowDownCircle, Trash2, Save, PanelRight } from 'lucide-react';
import { HexSwitch } from '../ui/HexSwitch';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

interface TerminalContainerProps {
    logs: LogData[];
    onClear: () => void;
}

export const TerminalContainer = ({ logs, onClear }: TerminalContainerProps) => {
    const [autoScroll, setAutoScroll] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('HEX');
    const scrollRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logic
    useEffect(() => {
        if (autoScroll && endRef.current) {
            endRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [logs, autoScroll]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        if (autoScroll && !isNearBottom) {
            setAutoScroll(false);
        } else if (!autoScroll && isNearBottom) {
            setAutoScroll(true);
        }
    };

    const handleSaveLog = async () => {
        try {
            const path = await save({
                filters: [{
                    name: 'Log Files',
                    extensions: ['txt', 'log', 'json']
                }]
            });

            if (!path) return;

            let content = '';
            // Basic text format export
            logs.forEach(log => {
                const date = new Date(log.timestamp).toISOString();
                const dataStr = (typeof log.data === 'string')
                    ? log.data
                    : Array.from(log.data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                content += `[${date}] [${log.type}] ${dataStr}\n`;
            });

            await writeTextFile(path, content);
        } catch (err) {
            console.error('Failed to save log:', err);
        }
    };

    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 bg-muted border-b border-border">
                <div className="flex gap-2">
                    <button
                        onClick={onClear}
                        className="p-1 hover:bg-black/10 rounded"
                        title="Clear Output"
                    >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                        onClick={handleSaveLog}
                        className="p-1 hover:bg-black/10 rounded"
                        title="Save Log"
                    >
                        <Save className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <div className="h-4 w-[1px] bg-border mx-1" />
                    <HexSwitch
                        checked={viewMode === 'HEX'}
                        onChange={(checked) => setViewMode(checked ? 'HEX' : 'ASCII')}
                        size="sm"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
                        className="p-1 hover:bg-black/10 rounded"
                        title="Toggle Sidebar"
                    >
                        <PanelRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={cn(
                            "p-1 rounded",
                            autoScroll ? "text-primary" : "text-muted-foreground"
                        )}
                        title={autoScroll ? "Auto-scroll On" : "Auto-scroll Off"}
                    >
                        <ArrowDownCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Simple Native List for Verification */}
            <div
                className="flex-1 min-h-0 bg-white border-t border-border overflow-y-auto font-mono text-xs"
                onScroll={handleScroll}
                ref={scrollRef}
            >
                {logs.map((log, index) => (
                    <LogEntry
                        key={log.id}
                        index={index}
                        entry={log}
                        style={{ height: 24, width: '100%' }}
                        mode={viewMode}
                    />
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};
