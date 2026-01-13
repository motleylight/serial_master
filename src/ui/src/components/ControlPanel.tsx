import { useState, useEffect, KeyboardEvent } from "react";
import { SerialService, SerialConfig, SerialPortInfo } from "../services/ipc";
import { cn } from "../lib/utils";
import { RefreshCw, Link, Link2Off, Send } from "lucide-react";
import { HexSwitch } from "./ui/HexSwitch";

interface ControlPanelProps {
    config: SerialConfig;
    setConfig: (config: SerialConfig) => void;
    connected: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSend: (data: Uint8Array | number[]) => void;
    onOpenScripting: () => void;
}

export function ControlPanel({
    config,
    setConfig,
    connected,
    onConnect,
    onDisconnect,
    onSend,
    onOpenScripting,
}: ControlPanelProps) {
    // --- Settings Logic ---
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const refreshPorts = async () => {
        setLoading(true);
        try {
            const availablePorts = await SerialService.getPorts();
            setPorts(availablePorts);
            if (availablePorts.length > 0 && (!config.port_name || !availablePorts.includes(config.port_name))) {
                handleChange("port_name", availablePorts[0]);
            }
        } catch (error) {
            console.error("Failed to list ports:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshPorts();
    }, []);

    const handleChange = (key: keyof SerialConfig, value: string | number) => {
        setConfig({ ...config, [key]: value });
    };

    // --- Input Logic ---
    const [input, setInput] = useState('');
    const [isHex, setIsHex] = useState(false);
    const [appendMode, setAppendMode] = useState<'None' | 'CR' | 'LF' | 'CRLF'>('None');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const handleSend = () => {
        if (!input) return;

        setHistory(prev => {
            if (prev.length === 0 || prev[prev.length - 1] !== input) {
                const newHistory = [...prev, input];
                if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
                return newHistory;
            }
            return prev;
        });
        setHistoryIndex(-1);

        try {
            let data: Uint8Array;
            if (isHex) {
                const cleanHex = input.replace(/[^0-9A-Fa-f]/g, '');
                if (cleanHex.length % 2 !== 0) {
                    console.error("Invalid Hex String");
                    // Could add toast here
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
            setInput('');
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
        <div className="flex flex-col border-t border-border bg-muted/20">
            {/* Top Row: Settings */}
            <div className="flex flex-wrap items-center gap-2 p-2 border-b border-border/50 text-xs">
                {/* Port */}
                <div className="flex items-center gap-1">
                    <select
                        className="h-7 w-28 rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={config.port_name}
                        disabled={connected}
                        onChange={(e) => handleChange("port_name", e.target.value)}
                    >
                        {ports.map((port) => <option key={port} value={port}>{port}</option>)}
                    </select>
                    <button
                        onClick={refreshPorts}
                        disabled={connected || loading}
                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background hover:bg-accent disabled:opacity-50"
                        title="Refresh Ports"
                    >
                        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    </button>
                </div>

                {/* Baud */}
                <select
                    className="h-7 w-24 rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                    value={config.baud_rate}
                    disabled={connected}
                    onChange={(e) => handleChange("baud_rate", parseInt(e.target.value))}
                >
                    {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => (
                        <option key={rate} value={rate}>{rate}</option>
                    ))}
                </select>

                {/* Extra Settings (Compact) */}
                <div className="flex items-center gap-1 border-l border-r border-border/50 px-2 mx-1">
                    <select
                        className="h-7 w-16 rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={config.data_bits}
                        disabled={connected}
                        onChange={(e) => handleChange("data_bits", parseInt(e.target.value))}
                        title="Data Bits"
                    >
                        {[5, 6, 7, 8].map(b => <option key={b} value={b}>{b} bit</option>)}
                    </select>
                    <select
                        className="h-7 w-16 rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={config.stop_bits}
                        disabled={connected}
                        onChange={(e) => handleChange("stop_bits", parseInt(e.target.value))}
                        title="Stop Bits"
                    >
                        <option value={1}>1 stop</option>
                        <option value={2}>2 stop</option>
                    </select>
                    <select
                        className="h-7 w-20 rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={config.parity}
                        disabled={connected}
                        onChange={(e) => handleChange("parity", e.target.value)}
                        title="Parity"
                    >
                        <option value="None">No Parity</option>
                        <option value="Odd">Odd</option>
                        <option value="Even">Even</option>
                    </select>
                </div>

                {/* Connect Button */}
                <button
                    onClick={onOpenScripting}
                    className="ml-auto h-7 px-3 rounded flex items-center gap-1.5 font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white shadow-sm mr-2"
                    title="Scripting"
                >
                    <span className="text-xs">Scripting</span>
                </button>

                <button
                    onClick={connected ? onDisconnect : onConnect}
                    className={cn(
                        "h-7 px-3 rounded flex items-center gap-1.5 font-medium transition-colors text-white shadow-sm",
                        connected ? "bg-red-500 hover:bg-red-600" : "bg-green-600 hover:bg-green-700"
                    )}
                >
                    {connected ? <><Link2Off className="w-3.5 h-3.5" /> Disconnect</> : <><Link className="w-3.5 h-3.5" /> Connect</>}
                </button>
            </div>

            {/* Bottom Row: Input & Send */}
            <div className="flex items-center gap-3 p-2 bg-background">
                <HexSwitch
                    checked={isHex}
                    onChange={setIsHex}
                    size="md"
                />

                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isHex ? "Enter Hex (e.g. AA BB CC)" : "Enter text to send..."}
                            className={cn(
                                "w-full h-10 px-3 text-sm border border-input rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary",
                                isHex && "font-mono"
                            )}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                            <select
                                value={appendMode}
                                onChange={(e) => setAppendMode(e.target.value as any)}
                                className="h-8 text-[11px] bg-transparent border-none text-muted-foreground focus:ring-0 cursor-pointer hover:bg-black/5 rounded px-1"
                                title="Line Ending"
                            >
                                <option value="None">None</option>
                                <option value="LF">LF</option>
                                <option value="CR">CR</option>
                                <option value="CRLF">CRLF</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSend}
                    disabled={!connected || !input}
                    className="h-10 px-6 bg-primary text-primary-foreground rounded shadow hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors"
                >
                    Send <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
