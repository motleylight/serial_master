import { useState, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../lib/utils';

interface InputAreaProps {
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
}

export function InputArea({ onSend, connected }: InputAreaProps) {
    const [input, setInput] = useState('');
    const [isHex, setIsHex] = useState(false);
    const [appendMode, setAppendMode] = useState<'None' | 'CR' | 'LF' | 'CRLF'>('None');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const handleSend = () => {
        if (!input) return;

        // Add to history if unique or last one different
        setHistory(prev => {
            if (prev.length === 0 || prev[prev.length - 1] !== input) {
                return [...prev, input];
            }
            return prev;
        });
        setHistoryIndex(-1);

        try {
            let data: Uint8Array;
            if (isHex) {
                // Remove spaces and validate
                const cleanHex = input.replace(/[^0-9A-Fa-f]/g, '');
                if (cleanHex.length % 2 !== 0) {
                    // TODO: Show error in UI
                    console.error("Invalid Hex String");
                    return;
                }
                const bytes = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) {
                    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
                }
                data = bytes;
            } else {
                let textToSend = input;
                if (appendMode === 'CR') textToSend += '\r';
                if (appendMode === 'LF') textToSend += '\n';
                if (appendMode === 'CRLF') textToSend += '\r\n';

                data = new TextEncoder().encode(textToSend);
            }

            onSend(data);
            setInput(''); // Clear after success
        } catch (error) {
            console.error(error);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length > 0) {
                const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex !== -1) {
                const newIndex = historyIndex + 1;
                if (newIndex >= history.length) {
                    setHistoryIndex(-1);
                    setInput('');
                } else {
                    setHistoryIndex(newIndex);
                    setInput(history[newIndex]);
                }
            }
        }
    };

    return (
        <div className="flex flex-col gap-2 p-2 border-t border-border bg-background">
            <div className="flex gap-2 items-center text-xs">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={isHex}
                        onChange={(e) => setIsHex(e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    <span>Hex Send</span>
                </label>

                <div className="h-3 w-[1px] bg-border mx-1" />

                <span className="text-muted-foreground mr-1">Line End:</span>
                <select
                    value={appendMode}
                    onChange={(e) => setAppendMode(e.target.value as any)}
                    className="h-6 rounded border border-input text-xs px-1"
                >
                    <option value="None">None</option>
                    <option value="LF">\n (LF)</option>
                    <option value="CR">\r (CR)</option>
                    <option value="CRLF">\r\n (CRLF)</option>
                </select>

                {/* Could add Interval send here later */}
            </div>

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isHex ? "Enter Hex (e.g. AA BB CC)" : "Enter text to send..."}
                        className={cn(
                            "w-full h-9 px-3 py-1 text-sm border border-input rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary",
                            isHex && "font-mono"
                        )}
                    />
                </div>
                <button
                    onClick={handleSend}
                    disabled={!connected || !input}
                    className="h-9 px-4 bg-primary text-primary-foreground rounded shadow hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 font-medium text-sm transition-colors"
                >
                    Send <Send className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
