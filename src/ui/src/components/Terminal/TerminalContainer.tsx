import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { type LogData, type HighlightRange, LogEntry, type ViewMode, formatLogLine } from './LogEntry';
import { cn } from '../../lib/utils';
import { Trash2, Save as SaveIcon, PanelRight, Search, ChevronUp, ChevronDown, ChevronRight, WrapText, FolderOpen } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useDebounce } from '../../hooks/useDebounce';
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { TerminalConfig } from '../../hooks/useAppConfig';

interface TerminalContainerProps {
    logs: LogData[];
    setLogs?: (logs: LogData[]) => void;
    onClear: () => void;
    config: TerminalConfig;
    onConfigChange: (config: Partial<TerminalConfig>) => void;
}

const ROW_HEIGHT = 24;
const MAX_CROSS_LINES = 5;

// 动态行高估算参数
const CHAR_WIDTH = 6.0; // text-xs 等宽字体约 6px/字符
const LINE_HEIGHT = 18; // 多行模式下每行高度（text-xs 12px * 1.5 行高）
const METADATA_WIDTH = 155; // 时间戳 + 类型 + gap 占用的宽度
const CONTENT_PADDING = 16; // 左右 padding

const textDecoder = new TextDecoder();

type SearchMode = 'search' | 'filter';

interface MatchResult {
    logIndex: number;
    highlights: HighlightRange[];
}

const getLogText = (log: LogData): string => {
    if (typeof log.data === 'string') {
        return log.data;
    }
    return textDecoder.decode(log.data);
};

const normalizeLineEndings = (text: string): string => {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

// ... (keep matching functions as they are, assume context remains) ...
// Actually replace_file_content needs context matches. I'm replacing top part.
// I will not replace the helper functions, so I should be careful to target correctly.
// I'll skip re-declaring helpers in ReplacementContent if I can target specific block.
// But I need to update TerminalContainer implementation which is further down.
// I will split into two edits if needed, or target the component definition.

// Strategy: Import first. Then Component definition.


// 普通字符串匹配
const findSimpleMatches = (
    logs: LogData[],
    searchStr: string,
    caseSensitive: boolean
): Map<number, MatchResult> => {
    const results = new Map<number, MatchResult>();
    const needle = caseSensitive ? searchStr : searchStr.toLowerCase();

    for (let i = 0; i < logs.length; i++) {
        const text = normalizeLineEndings(getLogText(logs[i]));
        const haystack = caseSensitive ? text : text.toLowerCase();
        const highlights: HighlightRange[] = [];

        let pos = 0;
        while ((pos = haystack.indexOf(needle, pos)) !== -1) {
            highlights.push({
                start: pos,
                end: pos + searchStr.length
            });
            pos += searchStr.length || 1;
        }

        if (highlights.length > 0) {
            results.set(i, { logIndex: i, highlights });
        }
    }

    return results;
};

// 单行正则匹配
const findSingleLineMatches = (
    logs: LogData[],
    pattern: RegExp
): Map<number, MatchResult> => {
    const results = new Map<number, MatchResult>();

    for (let i = 0; i < logs.length; i++) {
        const text = normalizeLineEndings(getLogText(logs[i]));
        const highlights: HighlightRange[] = [];

        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            highlights.push({
                start: match.index,
                end: match.index + match[0].length
            });
            if (match[0].length === 0) pattern.lastIndex++;
        }

        if (highlights.length > 0) {
            results.set(i, { logIndex: i, highlights });
        }
    }

    return results;
};

// 跨行正则匹配
const findCrossLineMatches = (
    logs: LogData[],
    pattern: RegExp
): Map<number, MatchResult> => {
    const results = new Map<number, MatchResult>();
    const addedHighlights = new Map<number, Set<string>>();

    for (let start = 0; start < logs.length; start++) {
        let windowText = '';
        const lineRanges: { logIdx: number; start: number; end: number }[] = [];

        for (let i = start; i < Math.min(start + MAX_CROSS_LINES, logs.length); i++) {
            const lineStart = windowText.length;
            const text = normalizeLineEndings(getLogText(logs[i]));
            windowText += text;
            const lineEnd = windowText.length;
            lineRanges.push({ logIdx: i, start: lineStart, end: lineEnd });

            if (!text.endsWith('\n')) {
                windowText += '\n';
            }
        }

        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(windowText)) !== null) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;

            for (const range of lineRanges) {
                const overlapStart = Math.max(matchStart, range.start);
                const overlapEnd = Math.min(matchEnd, range.end);

                if (overlapStart < overlapEnd) {
                    const highlight: HighlightRange = {
                        start: overlapStart - range.start,
                        end: overlapEnd - range.start
                    };

                    const highlightKey = `${highlight.start}-${highlight.end}`;
                    if (!addedHighlights.has(range.logIdx)) {
                        addedHighlights.set(range.logIdx, new Set());
                    }
                    const lineHighlights = addedHighlights.get(range.logIdx)!;

                    if (!lineHighlights.has(highlightKey)) {
                        lineHighlights.add(highlightKey);

                        if (results.has(range.logIdx)) {
                            results.get(range.logIdx)!.highlights.push(highlight);
                        } else {
                            results.set(range.logIdx, {
                                logIndex: range.logIdx,
                                highlights: [highlight]
                            });
                        }
                    }
                }
            }

            if (match[0].length === 0) pattern.lastIndex++;
        }
    }

    return results;
};

interface LogRowProps {
    logs: LogData[];
    viewMode: ViewMode;
    matchResults: Map<number, MatchResult>;
    currentMatchIndex: number;
    matchedLogIndices: number[];
    wordWrap: boolean;
    showMetadata: boolean;
}

const LogRow = ({ index, style, logs, viewMode, matchResults, currentMatchIndex, matchedLogIndices, wordWrap, showMetadata }: RowComponentProps<LogRowProps>) => {
    const log = logs[index];
    if (!log) return null;

    const matchResult = matchResults.get(index);
    const isCurrentMatch = matchedLogIndices[currentMatchIndex] === index;

    return (
        <LogEntry
            key={log.id}
            index={index}
            entry={log}
            style={style}
            mode={viewMode}
            highlights={matchResult?.highlights}
            isCurrentMatch={isCurrentMatch}
            wordWrap={wordWrap}
            showMetadata={showMetadata}
        />
    );
};

export const TerminalContainer = ({ logs, setLogs, onClear, config, onConfigChange }: TerminalContainerProps) => {
    // Local state initialized from config, kept in sync via useEffect
    const [autoScroll, setAutoScroll] = useState(config.autoScroll);
    const [viewMode, setViewMode] = useState<ViewMode>(config.hexMode ? 'HEX' : 'ASCII');
    const [wordWrap, setWordWrap] = useState(config.wordWrap);
    const [showMetadata, setShowMetadata] = useState(true);

    // Sync from config (External updates)
    useEffect(() => {
        setAutoScroll(config.autoScroll);
    }, [config.autoScroll]);

    useEffect(() => {
        setViewMode(config.hexMode ? 'HEX' : 'ASCII');
    }, [config.hexMode]);

    useEffect(() => {
        setWordWrap(config.wordWrap);
    }, [config.wordWrap]);

    // Helper to update both local and config
    const updateAutoScroll = useCallback((val: boolean) => {
        setAutoScroll(val);
        onConfigChange({ autoScroll: val });
    }, [onConfigChange]);

    // Ref to access current autoScroll value in callbacks without stale closure
    const autoScrollRef = useRef(autoScroll);
    useEffect(() => {
        autoScrollRef.current = autoScroll;
    }, [autoScroll]);



    const updateWordWrap = (val: boolean) => {
        setWordWrap(val);
        onConfigChange({ wordWrap: val });
    };

    const [searchMode, setSearchMode] = useState<SearchMode>('search');
    const [searchText, setSearchText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [contextLines, setContextLines] = useState(0);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // 匹配选项
    const [isRegex, setIsRegex] = useState(true);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [enableCrossLine, setEnableCrossLine] = useState(false);

    // 展开替换行（VSCode 风格）
    const [showReplace, setShowReplace] = useState(false);

    // ... useDebounce hooks
    const debouncedSearchText = useDebounce(searchText, 300);
    const debouncedReplaceText = useDebounce(replaceText, 300);
    const debouncedContextLines = useDebounce(contextLines, 300);

    const [isRegexValid, setIsRegexValid] = useState(true);

    const listRef = useRef<ListImperativeAPI>(null);
    const listContainerRef = useRef<HTMLDivElement>(null);
    const isProgrammaticScrollRef = useRef(false);
    // 用户手动切换 autoScroll 后的冷却时间，防止 handleRowsRendered 覆盖用户选择
    const userManualOverrideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 动态行高缓存系统
    // key = `${logId}-${containerWidth}`, value = estimated height
    const heightCacheRef = useRef<Map<string, number>>(new Map());
    const [containerWidth, setContainerWidth] = useState(0);
    const lastContainerWidthRef = useRef(0);
    // 用于强制刷新 List 的 key
    const [listKey, setListKey] = useState(0);

    // 当容器宽度变化时清空缓存
    useEffect(() => {
        if (containerWidth !== lastContainerWidthRef.current && containerWidth > 0) {
            heightCacheRef.current.clear();
            lastContainerWidthRef.current = containerWidth;
            // 强制刷新 List
            setListKey(k => k + 1);
        }
    }, [containerWidth]);

    // 当 wordWrap 或 showMetadata 切换时清空缓存
    useEffect(() => {
        heightCacheRef.current.clear();
        setListKey(k => k + 1);
    }, [wordWrap, showMetadata]);

    // 估算单行内容需要的高度
    const estimateRowHeight = useCallback((log: LogData, width: number): number => {
        if (!wordWrap || width <= 0) {
            return ROW_HEIGHT;
        }

        const text = getLogText(log);
        // 计算可用内容宽度
        const availableWidth = width - (showMetadata ? METADATA_WIDTH : 0) - CONTENT_PADDING;
        if (availableWidth <= 0) {
            return ROW_HEIGHT;
        }

        // 估算每行可容纳的字符数
        const charsPerLine = Math.floor(availableWidth / CHAR_WIDTH);
        if (charsPerLine <= 0) {
            return ROW_HEIGHT;
        }

        // 估算需要的行数，使用更精确的行高
        const lines = Math.ceil(text.length / charsPerLine);
        // 多行时使用 LINE_HEIGHT，加上 8px 的上下 padding
        return Math.max(ROW_HEIGHT, lines * LINE_HEIGHT + 8);
    }, [wordWrap, showMetadata]);

    // User interaction handlers for autoscroll disconnect
    // 1. Click on terminal content = user wants to inspect specific content
    // 2. Mousedown on scrollbar = user wants to manually control scroll position
    const handleTerminalClick = useCallback(() => {
        if (autoScrollRef.current) {
            updateAutoScroll(false);
        }
    }, [updateAutoScroll]);

    const handleTerminalMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!autoScrollRef.current) return;

        const container = e.currentTarget;
        const rect = container.getBoundingClientRect();
        // Scrollbar is typically ~17px wide on Windows, use 20px threshold
        const scrollbarWidth = 20;
        const clickX = e.clientX - rect.left;
        const isScrollbarArea = clickX > rect.width - scrollbarWidth;

        if (isScrollbarArea) {
            updateAutoScroll(false);
        }
    }, [updateAutoScroll]);

    // Validating regex
    useEffect(() => {
        if (isRegex && debouncedSearchText) {
            try {
                new RegExp(debouncedSearchText, caseSensitive ? 'g' : 'gi');
                setIsRegexValid(true);
            } catch {
                setIsRegexValid(false);
            }
        } else {
            setIsRegexValid(true);
        }
    }, [debouncedSearchText, isRegex, caseSensitive]);

    // Filter logs based on metadata visibility
    const visibleLogs = useMemo(() => {
        if (showMetadata) return logs;
        return logs.filter(log => log.type !== 'SYS');
    }, [logs, showMetadata]);

    const matchResults = useMemo((): Map<number, MatchResult> => {
        if (!debouncedSearchText || viewMode === 'HEX') {
            return new Map();
        }

        if (!isRegex) {
            return findSimpleMatches(visibleLogs, debouncedSearchText, caseSensitive);
        }

        if (!isRegexValid) {
            return new Map();
        }

        try {
            const flags = caseSensitive ? 'g' : 'gi';
            const regex = new RegExp(debouncedSearchText, flags);
            return enableCrossLine
                ? findCrossLineMatches(visibleLogs, regex)
                : findSingleLineMatches(visibleLogs, regex);
        } catch {
            return new Map();
        }
    }, [visibleLogs, debouncedSearchText, isRegex, isRegexValid, caseSensitive, viewMode, enableCrossLine]);

    const matchedLogIndices = useMemo(() => {
        return Array.from(matchResults.keys()).sort((a, b) => a - b);
    }, [matchResults]);

    useEffect(() => {
        setCurrentMatchIndex(0);
    }, [matchedLogIndices.length]);

    const { filterResult, filterIndexMap } = useMemo(() => {
        if (!debouncedSearchText) {
            return { filterResult: visibleLogs, filterIndexMap: null };
        }

        const matchIndices = new Set(matchResults.keys());
        if (matchIndices.size === 0) {
            return { filterResult: [] as LogData[], filterIndexMap: new Map<number, number>() };
        }

        let regex: RegExp | null = null;
        if (isRegex && isRegexValid) {
            try {
                regex = new RegExp(debouncedSearchText, caseSensitive ? 'g' : 'gi');
            } catch {
                // ignore
            }
        }

        const linesToShow = new Set<number>();
        const ctx = Math.max(0, debouncedContextLines);

        matchIndices.forEach(idx => {
            const start = Math.max(0, idx - ctx);
            const end = Math.min(visibleLogs.length - 1, idx + ctx);
            for (let i = start; i <= end; i++) {
                linesToShow.add(i);
            }
        });

        const sortedIndices = Array.from(linesToShow).sort((a, b) => a - b);
        const result: LogData[] = [];
        const indexMap = new Map<number, number>();
        let prevIdx = -1;

        sortedIndices.forEach(idx => {
            if (ctx > 0 && prevIdx !== -1 && idx > prevIdx + 1) {
                result.push({
                    id: -Math.random(),
                    timestamp: 0,
                    type: 'SEP',
                    data: ''
                });
            }
            prevIdx = idx;

            const log = visibleLogs[idx];
            const isDirectMatch = matchIndices.has(idx);
            let modifiedLog = log;

            if (isDirectMatch && showReplace && debouncedReplaceText && regex) {
                try {
                    const textContent = getLogText(log);
                    const newContent = textContent.replace(regex, debouncedReplaceText);
                    modifiedLog = { ...log, data: newContent };
                } catch {
                    // ignore
                }
            }

            indexMap.set(idx, result.length);
            result.push(modifiedLog);
        });

        return { filterResult: result, filterIndexMap: indexMap };
    }, [visibleLogs, debouncedSearchText, debouncedReplaceText, showReplace, debouncedContextLines, matchResults, isRegex, isRegexValid, caseSensitive]);

    const displayLogs = searchMode === 'filter' ? filterResult : visibleLogs;

    // 获取指定行的高度（带缓存）
    const getRowHeight = useCallback((index: number): number => {
        if (!wordWrap) {
            return ROW_HEIGHT;
        }

        const log = displayLogs[index];
        if (!log) {
            return ROW_HEIGHT;
        }

        const cacheKey = `${log.id}-${containerWidth}`;
        const cached = heightCacheRef.current.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const height = estimateRowHeight(log, containerWidth);
        heightCacheRef.current.set(cacheKey, height);
        return height;
    }, [wordWrap, displayLogs, containerWidth, estimateRowHeight]);

    const displayMatchResults = useMemo((): Map<number, MatchResult> => {
        if (searchMode !== 'filter' || !filterIndexMap) {
            return matchResults;
        }

        const newResults = new Map<number, MatchResult>();
        matchResults.forEach((result, origIdx) => {
            const newIdx = filterIndexMap.get(origIdx);
            if (newIdx !== undefined) {
                newResults.set(newIdx, {
                    ...result,
                    logIndex: newIdx
                });
            }
        });

        return newResults;
    }, [searchMode, filterIndexMap, matchResults]);

    const displayMatchedLogIndices = useMemo(() => {
        return Array.from(displayMatchResults.keys()).sort((a, b) => a - b);
    }, [displayMatchResults]);

    const goToNextMatch = useCallback(() => {
        const indices = displayMatchedLogIndices;
        if (indices.length === 0) return;

        const newIndex = (currentMatchIndex + 1) % indices.length;
        setCurrentMatchIndex(newIndex);

        if (listRef.current) {
            isProgrammaticScrollRef.current = true;
            listRef.current.scrollToRow({
                index: indices[newIndex],
                align: 'center',
                behavior: 'smooth'
            });
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        }
    }, [currentMatchIndex, displayMatchedLogIndices]);

    const goToPrevMatch = useCallback(() => {
        const indices = displayMatchedLogIndices;
        if (indices.length === 0) return;

        const newIndex = (currentMatchIndex - 1 + indices.length) % indices.length;
        setCurrentMatchIndex(newIndex);

        if (listRef.current) {
            isProgrammaticScrollRef.current = true;
            listRef.current.scrollToRow({
                index: indices[newIndex],
                align: 'center',
                behavior: 'smooth'
            });
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        }
    }, [currentMatchIndex, displayMatchedLogIndices]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3' || (e.key === 'Enter' && document.activeElement?.tagName === 'INPUT')) {
                e.preventDefault();
                if (e.shiftKey) {
                    goToPrevMatch();
                } else {
                    goToNextMatch();
                }
            } else if (e.key === 'Escape') {
                setSearchText('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToNextMatch, goToPrevMatch]);

    useEffect(() => {
        if (autoScroll && listRef.current && displayLogs.length > 0) {
            isProgrammaticScrollRef.current = true;
            listRef.current.scrollToRow({
                index: displayLogs.length - 1,
                align: 'end',
                behavior: 'auto'
            });
            // Use double RAF to ensure scroll events complete before clearing flag
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    isProgrammaticScrollRef.current = false;
                });
            });
        }
    }, [displayLogs.length, autoScroll]);

    const handleRowsRendered = useCallback((
        _visibleRows: { startIndex: number; stopIndex: number },
        _allRows: { startIndex: number; stopIndex: number }
    ) => {
        // Position-based disconnect removed.
        // Autoscroll disconnect is now triggered by explicit user actions:
        // - Click on terminal content (handleTerminalClick)
        // - Mousedown on scrollbar area (handleTerminalMouseDown)
    }, []);

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
            // Save what is currently visible (including filtered out SYS?) 
            // The requirement "WYSIWYG" implies we save visibleLogs.
            // If SYS is hidden via Info=Off, it should not be in the file?
            // "if this button off, sys entire message disappear" -> "WYSIWYG" -> save should exclude it.
            // Using displayLogs (which is based on visibleLogs) ensures we save what we see.
            // BUT, displayLogs is ALSO affected by SEARCH FILTER.
            // Usually SAVE saves everything. 
            // However, the rule "hide SYS entire message" suggests it's a view filter effectively cleaning the data stream view.
            // Let's assume we save `visibleLogs` (all logs minus hidden SYS), but ignoring Search filters.

            // Wait, standard Save usually saves everything. But if I hide SYS, maybe I don't want to save SYS.
            // Let's stick to the prompt: "ensure current displayed and saved are consistent".
            // If I search filter, I usually still want to save the "full" (but maybe metadata-less) log?
            // Actually, if I am in filter mode, I see only filtered lines. Should I save only filtered lines?
            // Usually "Save Log" implies saving the session.
            // But "WYSIWYG" implies saving what I see.
            // Let's use `visibleLogs` (which respects Info toggle) but NOT `displayLogs` (which respects Search).
            // This is a safe middle ground: Info toggle acts as a global view setting (like a channel filter), while Search is temporary.
            // So I will iterate `visibleLogs`.

            visibleLogs.forEach(log => {
                content += formatLogLine(log, showMetadata, viewMode) + '\n';
            });

            await writeTextFile(path, content);
        } catch (err) {
            console.error('Failed to save log:', err);
        }
    };

    const handleLoadLog = async () => {
        if (!setLogs) return;

        try {
            const path = await open({
                filters: [{
                    name: 'Log Files',
                    extensions: ['txt', 'log']
                }]
            });

            if (!path || Array.isArray(path)) return;

            const content = await readTextFile(path);
            const lines = content.split(/\r?\n/);

            const newLogs: LogData[] = [];
            const now = Date.now();
            const logRegex = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\] \[(\w+)\] (.*)$/;

            let metadataMatchCount = 0;
            let validLineCount = 0;

            lines.forEach((line, index) => {
                if (!line.trim()) return;
                validLineCount++;

                const match = line.match(logRegex);
                if (match) {
                    metadataMatchCount++;
                    const [, _timeStr, typeStr, dataStr] = match;
                    newLogs.push({
                        id: now + index,
                        timestamp: now,
                        type: typeStr as any,
                        data: dataStr
                    });
                } else {
                    // Fallback to RX so it is visible even if Info is off
                    newLogs.push({
                        id: now + index,
                        timestamp: now,
                        type: 'RX',
                        data: line
                    });
                }
            });

            setLogs(newLogs);

            // Auto-detect metadata
            // If more than 50% of lines have metadata, show it. Otherwise hide it.
            if (validLineCount > 0 && (metadataMatchCount / validLineCount) > 0.5) {
                setShowMetadata(true);
            } else {
                setShowMetadata(false);
            }

        } catch (err) {
            console.error('Failed to load log:', err);
        }
    };

    const rowProps = useMemo<LogRowProps>(() => ({
        logs: displayLogs,
        viewMode,
        matchResults: displayMatchResults,
        currentMatchIndex,
        matchedLogIndices: displayMatchedLogIndices,
        wordWrap: wordWrap,
        showMetadata
    }), [displayLogs, viewMode, displayMatchResults, currentMatchIndex, displayMatchedLogIndices, wordWrap, showMetadata]);

    const totalMatches = displayMatchedLogIndices.length;

    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar - Grid Layout for Strict Alignment */}
            <div className="border-b border-border bg-muted">
                {/* Single Grid Container for both rows - columns are shared */}
                <div
                    className="grid items-center px-2 py-1 gap-x-2 gap-y-1"
                    style={{
                        gridTemplateColumns: 'auto minmax(240px,1fr) auto minmax(0,130px)',
                        gridTemplateRows: showReplace ? 'auto auto' : 'auto'
                    }}
                >
                    {/* ROW 1: Main Controls */}
                    {/* COL 1: LEFT CONTROLS + SEARCH/FILTER TOGGLE */}
                    <div className="flex items-center gap-2 justify-start overflow-hidden">
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={onClear} className="shrink-0 p-1 hover:bg-black/10 rounded" title="Clear Output">
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                            {setLogs && (
                                <button onClick={handleLoadLog} className="shrink-0 p-1 hover:bg-black/10 rounded" title="Load Log">
                                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                                </button>
                            )}
                            <button onClick={handleSaveLog} className="shrink-0 p-1 hover:bg-black/10 rounded" title="Save Log">
                                <SaveIcon className="w-4 h-4 text-muted-foreground" />
                            </button>

                            <div className="shrink-0 h-4 w-[1px] bg-border mx-1" />

                            <button
                                onClick={() => setShowMetadata(!showMetadata)}
                                className={cn(
                                    "shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-transparent transition-colors whitespace-nowrap",
                                    showMetadata ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground hover:bg-black/5"
                                )}
                                title="Toggle Timestamp & Info & SYS messages"
                            >
                                Info
                            </button>

                            <div className="shrink-0 h-4 w-[1px] bg-border mx-1" />
                        </div>

                        {/* SEARCH/FILTER TOGGLE (Fixed 110px, can be clipped) */}
                        <div className="flex rounded-md border border-input overflow-hidden shrink-0 w-[110px]">
                            <button
                                onClick={() => setSearchMode('search')}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "flex-1 px-0 py-1 text-xs font-medium transition-colors text-center",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    searchMode === 'search' ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                                )}
                            >
                                Search
                            </button>
                            <button
                                onClick={() => setSearchMode('filter')}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "flex-1 px-0 py-1 text-xs font-medium transition-colors border-l border-input text-center",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    searchMode === 'filter' ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                                )}
                            >
                                Filter
                            </button>
                        </div>
                    </div>

                    {/* COL 3: SEARCH INPUT (Flex 1fr) */}
                    <div className="relative w-full">
                        <Search className={cn(
                            "w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2",
                            viewMode === 'HEX' ? "text-muted-foreground/50" : "text-muted-foreground"
                        )} />

                        <input
                            type="text"
                            disabled={viewMode === 'HEX'}
                            placeholder={viewMode === 'HEX' ? "Switch to ASCII" : (isRegex ? "Regex..." : "Text...")}
                            title="F3 Next, Shift+F3 Prev"
                            className={cn(
                                "w-full h-7 pl-7 pr-[90px] text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
                                !isRegexValid ? "border-red-500 focus:ring-red-500" : "border-input"
                            )}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                        />

                        {/* Option Buttons (Inside Input) */}
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                            <button
                                onClick={() => setIsRegex(!isRegex)}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded text-xs font-mono font-bold transition-colors",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    isRegex ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/5"
                                )}
                                title={isRegex ? "Regex mode" : "Plain text mode"}
                            >
                                .*
                            </button>
                            <button
                                onClick={() => setCaseSensitive(!caseSensitive)}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded text-xs font-bold transition-colors",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    caseSensitive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/5"
                                )}
                                title={caseSensitive ? "Case sensitive" : "Case insensitive"}
                            >
                                Aa
                            </button>
                            <button
                                onClick={() => setEnableCrossLine(!enableCrossLine)}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded transition-colors",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    enableCrossLine ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-black/5"
                                )}
                                title={enableCrossLine ? "Cross-line allowed" : "Enable cross-line"}
                            >
                                <span className="font-mono text-xs font-bold">\n</span>
                            </button>
                        </div>
                    </div>

                    {/* COL 4: INFO / NAV (Can shrink) */}
                    <div className="flex items-center gap-2 justify-start overflow-hidden">
                        {/* Match Count */}
                        {searchText && (
                            <span className={cn(
                                "text-[10px] text-muted-foreground bg-black/5 px-2 py-1 rounded whitespace-nowrap text-center min-w-[3em]",
                            )}>
                                {searchMode === 'search'
                                    ? (totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : 'No results')
                                    : `${totalMatches} results`
                                }
                            </span>
                        )}

                        {/* Nav Buttons (Search) OR Expand (Filter) */}
                        {searchMode === 'search' ? (
                            <div className="flex items-center gap-1">
                                <button onClick={goToPrevMatch} disabled={totalMatches === 0} className="p-1 hover:bg-black/10 rounded disabled:opacity-30" title="Previous Match (Shift+F3)">
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button onClick={goToNextMatch} disabled={totalMatches === 0} className="p-1 hover:bg-black/10 rounded disabled:opacity-30" title="Next Match (F3)">
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowReplace(!showReplace)}
                                disabled={viewMode === 'HEX'}
                                className={cn(
                                    "p-1 rounded transition-transform",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "hover:bg-black/5"
                                )}
                                title={showReplace ? "Collapse advanced options" : "Expand advanced options"}
                            >
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-muted-foreground transition-transform",
                                    showReplace && "rotate-90"
                                )} />
                            </button>
                        )}
                    </div>

                    {/* COL 5: RIGHT CONTROLS (Can shrink) */}
                    <div className="flex items-center gap-2 justify-end overflow-hidden">
                        <div className="h-4 w-[1px] bg-border mx-1" />
                        <div className="flex gap-1">
                            <button
                                onClick={() => updateWordWrap(!wordWrap)}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    wordWrap ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/5"
                                )}
                                title={wordWrap ? "Word Wrap On" : "Word Wrap Off"}
                            >
                                <WrapText className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => {
                                    updateAutoScroll(!autoScroll);
                                    // Set temporary override to ignore scroll events
                                    if (userManualOverrideRef.current) {
                                        clearTimeout(userManualOverrideRef.current);
                                    }
                                    userManualOverrideRef.current = setTimeout(() => {
                                        userManualOverrideRef.current = null;
                                    }, 1000);
                                }}
                                className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-medium border border-transparent transition-colors whitespace-nowrap",
                                    autoScroll ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground hover:bg-black/5"
                                )}
                            >
                                Auto Scroll
                            </button>
                            <button
                                onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
                                className="p-1 hover:bg-black/10 rounded"
                                title="Toggle Sidebar"
                            >
                                <PanelRight className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    {/* ROW 2: Advanced Options (Replace) - Only when showReplace is true */}
                    {showReplace && (
                        <>
                            {/* COL 1: Empty placeholder */}
                            <div className="bg-muted/50 -mx-2 px-2" />

                            {/* COL 2: REPLACE INPUT + CTX (same column as search, shared width) */}
                            <div className="bg-muted/50 flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                                    <input
                                        type="text"
                                        disabled={viewMode === 'HEX' || searchMode !== 'filter'}
                                        placeholder={searchMode !== 'filter' ? "Filter mode only" : "Replace with..."}
                                        className="w-full h-7 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                        value={replaceText}
                                        onChange={e => setReplaceText(e.target.value)}
                                    />
                                </div>
                                <span className="shrink-0 text-xs font-medium text-muted-foreground whitespace-nowrap" title="Context lines">Ctx:</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    disabled={searchMode !== 'filter'}
                                    className="shrink-0 w-10 h-7 px-1 text-xs text-center rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={contextLines || ''}
                                    onChange={e => setContextLines(parseInt(e.target.value) || 0)}
                                    title="Number of context lines"
                                />
                            </div>

                            {/* COL 3-4: Empty placeholders with background */}
                            <div className="bg-muted/50" />
                            <div className="bg-muted/50 -mx-2 px-2" />
                        </>
                    )}
                </div>
            </div>

            {/* Virtualized List */}
            <div
                ref={listContainerRef}
                className="flex-1 min-h-0 bg-white border-t border-border"
                onClick={handleTerminalClick}
                onMouseDown={handleTerminalMouseDown}
            >
                <AutoSizer
                    renderProp={({ height, width }) => {
                        if (height === undefined || width === undefined) {
                            return null;
                        }
                        // 更新容器宽度以供高度计算使用
                        if (width !== containerWidth) {
                            // 使用 setTimeout 避免在 render 中直接 setState
                            setTimeout(() => setContainerWidth(width), 0);
                        }
                        return (
                            <List
                                key={listKey}
                                listRef={listRef}
                                rowComponent={LogRow}
                                rowProps={rowProps}
                                rowCount={displayLogs.length}
                                rowHeight={wordWrap ? getRowHeight : ROW_HEIGHT}
                                className="font-mono text-xs"
                                overscanCount={10}
                                style={{ height, width }}
                                onRowsRendered={handleRowsRendered}
                            />
                        );
                    }}
                />
            </div>
        </div >
    );
};
