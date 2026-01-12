import { useRef, useEffect, useState } from 'react';
import { type LogData, LogEntry, type ViewMode } from './LogEntry';
import { cn } from '../../lib/utils';
import { ArrowDownCircle, Trash2, FileText, Binary } from 'lucide-react';

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
                    <div className="h-4 w-[1px] bg-border mx-1" />
                    <button
                        onClick={() => setViewMode('ASCII')}
                        className={cn(
                            "p-1 rounded text-xs font-mono",
                            viewMode === 'ASCII' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/10"
                        )}
                        title="ASCII View"
                    >
                        ASCII
                    </button>
                    <button
                        onClick={() => setViewMode('HEX')}
                        className={cn(
                            "p-1 rounded text-xs font-mono",
                            viewMode === 'HEX' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/10"
                        )}
                        title="Hex View"
                    >
                        HEX
                    </button>
                </div>

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
