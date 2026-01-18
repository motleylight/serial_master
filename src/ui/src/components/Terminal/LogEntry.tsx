import React from 'react';
import { cn } from '../../lib/utils';

export type ViewMode = 'ASCII' | 'HEX' | 'MIXED';

export interface LogData {
    id: number;
    timestamp: number;
    type: 'RX' | 'TX' | 'SYS' | 'ERR' | 'SEP';
    data: Uint8Array | string;
}

export interface HighlightRange {
    start: number;
    end: number;
}

interface LogEntryProps {
    entry: LogData;
    mode: ViewMode;
    style: React.CSSProperties;
    index: number;
    highlights?: HighlightRange[];
    isCurrentMatch?: boolean;
    wordWrap?: boolean;
    showMetadata?: boolean;
}

const formatHex = (data: Uint8Array): string => {
    return Array.from(data)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
};

const formatAscii = (data: Uint8Array): string => {
    // Replace non-printable chars with .
    return Array.from(data)
        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
        .join('');
};

export const formatLogLine = (entry: LogData, showMetadata: boolean, mode: ViewMode): string => {
    if (entry.type === 'SEP') {
        return '---';
    }

    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + `.${date.getMilliseconds().toString().padStart(3, '0')}`;

    let content = '';
    if (typeof entry.data === 'string') {
        content = entry.data;
    } else {
        if (mode === 'HEX') {
            content = formatHex(entry.data);
        } else if (mode === 'ASCII') {
            content = formatAscii(entry.data);
        } else {
            content = `${formatHex(entry.data)}  |  ${formatAscii(entry.data)}`;
        }
    }

    if (!showMetadata) {
        return content;
    }

    return `[${timeStr}] [${entry.type}] ${content}`;
};

// 渲染带高亮的文本
const renderHighlightedText = (text: string, highlights?: HighlightRange[], isCurrentMatch?: boolean): React.ReactNode => {
    if (!highlights || highlights.length === 0) {
        return text;
    }

    // 按起始位置排序
    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);
    const result: React.ReactNode[] = [];
    let lastEnd = 0;

    sortedHighlights.forEach((hl, idx) => {
        // 添加高亮前的普通文本
        if (hl.start > lastEnd) {
            result.push(text.slice(lastEnd, hl.start));
        }
        // 添加高亮文本
        const highlightedText = text.slice(hl.start, hl.end);
        result.push(
            <mark
                key={idx}
                className={cn(
                    "bg-yellow-300/70 px-0.5 rounded-sm",
                    isCurrentMatch && idx === 0 && "ring-2 ring-orange-500 bg-orange-300/70"
                )}
            >
                {highlightedText}
            </mark>
        );
        lastEnd = hl.end;
    });

    // 添加最后的普通文本
    if (lastEnd < text.length) {
        result.push(text.slice(lastEnd));
    }

    return result;
};

export const LogEntry = React.memo(({ entry, mode, style, index, highlights, isCurrentMatch, wordWrap = false, showMetadata = true }: LogEntryProps) => {
    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + `.${date.getMilliseconds().toString().padStart(3, '0')}`;

    if (entry.type === 'SEP') {
        return (
            <div style={style} className="flex items-center justify-center bg-gray-50/50">
                <div className="w-full h-[1px] bg-dashed border-t border-gray-300 mx-4 relative">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-50 px-2 text-[10px] text-gray-400">---</span>
                </div>
            </div>
        );
    }

    let content = '';

    if (typeof entry.data === 'string') {
        content = entry.data;
    } else {
        if (mode === 'HEX') {
            content = formatHex(entry.data);
        } else if (mode === 'ASCII') {
            content = formatAscii(entry.data);
        } else {
            content = `${formatHex(entry.data)}  |  ${formatAscii(entry.data)}`;
        }
    }

    const typeColor = {
        'RX': 'text-green-500',
        'TX': 'text-blue-500',
        'SYS': 'text-yellow-500',
        'ERR': 'text-red-500 font-bold',
        'SEP': 'text-gray-300'
    }[entry.type];

    // 渲染内容（带高亮或普通）
    const renderedContent = mode === 'HEX'
        ? content
        : renderHighlightedText(content, highlights, isCurrentMatch);

    return (
        <div style={style} className={cn(
            "flex gap-2 px-2 hover:bg-black/10 font-mono text-xs text-gray-800 overflow-hidden",
            wordWrap ? "items-start py-1" : "items-center",
            index % 2 === 0 ? "bg-gray-50" : "bg-white",
            isCurrentMatch && "bg-orange-50"
        )}>
            {showMetadata && (
                <>
                    <span className="text-gray-500 opacity-70 select-none shrink-0">[{timeStr}]</span>
                    <span className={cn("font-bold w-8 shrink-0", typeColor)}>{entry.type}</span>
                </>
            )}
            <span className={cn(
                "flex-1 min-w-0",
                wordWrap ? "whitespace-pre-wrap break-all leading-[18px]" : "truncate"
            )}>{renderedContent}</span>
        </div>
    );
});
