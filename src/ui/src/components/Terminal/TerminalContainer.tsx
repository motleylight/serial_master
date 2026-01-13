import { useRef, useEffect, useState, useMemo } from 'react';
import { type LogData, LogEntry, type ViewMode } from './LogEntry';
import { cn } from '../../lib/utils';
import { Trash2, Save, PanelRight, Search, Replace } from 'lucide-react';
import { HexSwitch } from '../ui/HexSwitch';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useDebounce } from '../../hooks/useDebounce';

interface TerminalContainerProps {
    logs: LogData[];
    onClear: () => void;
}

export const TerminalContainer = ({ logs, onClear }: TerminalContainerProps) => {
    const [autoScroll, setAutoScroll] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('ASCII');

    // Filter & Replace State
    const [filterText, setFilterText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [contextLines, setContextLines] = useState(0);

    // Debounce inputs to prevent lag on every keystroke
    const debouncedFilterText = useDebounce(filterText, 300);
    const debouncedReplaceText = useDebounce(replaceText, 300);
    const debouncedContextLines = useDebounce(contextLines, 300);

    const [isRegexValid, setIsRegexValid] = useState(true);

    const scrollRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logic
    useEffect(() => {
        if (autoScroll && endRef.current) {
            endRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [logs, autoScroll, debouncedFilterText, debouncedReplaceText, debouncedContextLines]); // Re-scroll on filter change

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
            // Export filtered logs if valid, otherwise all
            const logsToExport = filteredLogs || logs;
            logsToExport.forEach(log => {
                // Skip separator logs in export
                if (log.type === 'SEP') return;

                const date = new Date(log.timestamp).toISOString();
                let dataStr = '';
                if (typeof log.data === 'string') {
                    dataStr = log.data;
                } else {
                    // For HEX view, native export is hex string usually
                    // But if filtered and replaced, log.data is string
                    dataStr = Array.from(log.data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                }
                content += `[${date}] [${log.type}] ${dataStr}\n`;
            });

            await writeTextFile(path, content);
        } catch (err) {
            console.error('Failed to save log:', err);
        }
    };

    // Filter Logic
    const filteredLogs = useMemo(() => {
        // Validation check
        let regex: RegExp | null = null;
        if (debouncedFilterText) {
            try {
                regex = new RegExp(debouncedFilterText, 'i'); // Case insensitive
                setIsRegexValid(true);
            } catch (e) {
                setIsRegexValid(false);
                return logs; // Return original logs if regex is invalid
            }
        } else {
            setIsRegexValid(true);
        }

        if (!regex) return logs;

        // 1. Identify matches
        const matchIndices = new Set<number>();
        const logContentStrings = new Map<number, string>(); // Cache string conversion

        logs.forEach((log, index) => {
            let textContent = '';
            if (typeof log.data === 'string') {
                textContent = log.data;
            } else {
                textContent = new TextDecoder().decode(log.data);
            }
            logContentStrings.set(index, textContent);

            if (regex!.test(textContent)) {
                matchIndices.add(index);
            }
        });

        // If no matches, return empty or handle differently? 
        // Typically if filter is active but no match, show nothing.
        if (matchIndices.size === 0) return [];

        // 2. Expand Context
        const linesToShow = new Set<number>();
        const ctx = Math.max(0, debouncedContextLines);

        matchIndices.forEach(idx => {
            const start = Math.max(0, idx - ctx);
            const end = Math.min(logs.length - 1, idx + ctx);
            for (let i = start; i <= end; i++) {
                linesToShow.add(i);
            }
        });

        const sortedIndices = Array.from(linesToShow).sort((a, b) => a - b);
        const result: LogData[] = [];

        // 3. Build Result with Separators and Replacement
        let prevIdx = -1;

        sortedIndices.forEach(idx => {
            if (prevIdx !== -1 && idx > prevIdx + 1) {
                // Insert Separator
                result.push({
                    id: -Math.random(), // Temporary ID
                    timestamp: 0,
                    type: 'SEP',
                    data: ''
                });
            }
            prevIdx = idx;

            const log = logs[idx];
            const isDirectMatch = matchIndices.has(idx);
            let modifiedLog = log;

            // Apply Replace ONLY to direct matches
            if (isDirectMatch && showReplace && debouncedReplaceText) {
                try {
                    const textContent = logContentStrings.get(idx) || "";
                    const newContent = textContent.replace(regex!, debouncedReplaceText);
                    modifiedLog = { ...log, data: newContent };
                } catch (e) {
                    // ignore replace error
                }
            }

            result.push(modifiedLog);
        });

        return result;
    }, [logs, debouncedFilterText, debouncedReplaceText, showReplace, debouncedContextLines]);


    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 bg-muted border-b border-border gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Basic Controls */}
                    <button onClick={onClear} className="p-1 hover:bg-black/10 rounded" title="Clear Output">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={handleSaveLog} className="p-1 hover:bg-black/10 rounded" title="Save Log">
                        <Save className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <div className="h-4 w-[1px] bg-border mx-1" />
                    <HexSwitch
                        checked={viewMode === 'HEX'}
                        onChange={(checked) => setViewMode(checked ? 'HEX' : 'ASCII')}
                        size="sm"
                    />

                    <div className="h-4 w-[1px] bg-border mx-1" />

                    {/* Filter Inputs */}
                    <div className="flex items-center gap-1 flex-1 max-w-[500px]">
                        <div className="relative flex-1">
                            <Search className={cn("w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2", viewMode === 'HEX' ? "text-muted-foreground/50" : "text-muted-foreground")} />
                            <input
                                type="text"
                                disabled={viewMode === 'HEX'}
                                placeholder={viewMode === 'HEX' ? "Switch to ASCII to filter" : "Filter Regex..."}
                                title={viewMode === 'HEX' ? "Filtering is disabled in HEX mode" : "Supports JS Regex. Example: Error code: (\\d+)"}
                                className={cn(
                                    "w-full h-7 pl-7 pr-2 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
                                    !isRegexValid ? "border-red-500 focus:ring-red-500" : "border-input"
                                )}
                                value={filterText}
                                onChange={e => setFilterText(e.target.value)}
                            />
                        </div>

                        {/* Context Input */}
                        {(filterText) && (
                            <div className="w-12" title="Context Lines (Lines before/after match)">
                                <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    className="w-full h-7 px-1 text-xs text-center rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    placeholder="Ctx"
                                    value={contextLines || ''}
                                    onChange={e => setContextLines(parseInt(e.target.value) || 0)}
                                />
                            </div>
                        )}

                        {showReplace && (
                            <div className="relative flex-1">
                                <Replace className={cn("w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2", viewMode === 'HEX' ? "text-muted-foreground/50" : "text-muted-foreground")} />
                                <input
                                    type="text"
                                    disabled={viewMode === 'HEX'}
                                    placeholder="Replace ($1 for match)..."
                                    title="Use $1, $2 to reference captured groups from the filter regex"
                                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={replaceText}
                                    onChange={e => setReplaceText(e.target.value)}
                                />
                            </div>
                        )}

                        <button
                            onClick={() => setShowReplace(!showReplace)}
                            disabled={viewMode === 'HEX'}
                            className={cn(
                                "p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                                showReplace ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/5"
                            )}
                            title="Toggle Replace View"
                        >
                            <Replace className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Match Count Badge */}
                    {(filterText || replaceText) && (
                        <span className="text-[10px] text-muted-foreground bg-black/5 px-1.5 py-0.5 rounded">
                            {filteredLogs.length} matches
                        </span>
                    )}

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
                            "px-2 py-0.5 rounded text-[10px] font-medium border border-transparent transition-colors",
                            autoScroll
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "text-muted-foreground hover:bg-black/5 hover:text-gray-900"
                        )}
                        title={autoScroll ? "Disable Auto-scroll" : "Enable Auto-scroll"}
                    >
                        Auto Scroll
                    </button>
                </div>
            </div>

            {/* Simple Native List for Verification */}
            <div
                className="flex-1 min-h-0 bg-white border-t border-border overflow-y-auto font-mono text-xs"
                onScroll={handleScroll}
                ref={scrollRef}
            >
                {filteredLogs.map((log, index) => (
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
