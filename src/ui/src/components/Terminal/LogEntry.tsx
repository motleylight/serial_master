import React from 'react';
import { cn } from '../../lib/utils';

export type ViewMode = 'ASCII' | 'HEX' | 'MIXED';

export interface LogData {
    id: number;
    timestamp: number;
    type: 'RX' | 'TX' | 'SYS' | 'ERR' | 'SEP';
    data: Uint8Array | string;
}

interface LogEntryProps {
    entry: LogData;
    mode: ViewMode;
    style: React.CSSProperties;
    index: number;
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

export const LogEntry = React.memo(({ entry, mode, style, index }: LogEntryProps) => {
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

    return (
        <div style={style} className={cn(
            "flex items-center gap-2 px-2 hover:bg-black/10 font-mono text-xs whitespace-nowrap text-gray-800",
            index % 2 === 0 ? "bg-gray-50" : "bg-white"
        )}>
            <span className="text-gray-500 opacity-70 select-none">[{timeStr}]</span>
            <span className={cn("font-bold w-8 shrink-0", typeColor)}>{entry.type}</span>
            <span className="flex-1 truncate">{content}</span>
        </div>
    );
});
