import { useState, useEffect, KeyboardEvent, useRef } from "react";
import { SerialService, SerialConfig, SerialPortInfo } from "../services/ipc";
import { cn } from "../lib/utils";
import { RefreshCw, Link, Link2Off, Send, ChevronDown, X } from "lucide-react";
import { HexSwitch } from "./ui/HexSwitch";
import { PortSelect } from "./ui/PortSelect";
import { PortSharingToggle } from "./PortSharingToggle";
import { SendConfig, UiConfig } from "../hooks/useAppConfig";
import { ScriptService } from "../services/ScriptService";

interface ControlPanelProps {
    config: SerialConfig;
    setConfig: (config: SerialConfig) => void;
    connected: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSend: (data: Uint8Array | number[]) => void;
    onOpenScripting: () => void;
    onOpenPortSharing: () => void;
    sendConfig: SendConfig;
    onSendConfigChange: (config: Partial<SendConfig>) => void;
    ui: UiConfig;
    onUiUpdate: (updates: Partial<UiConfig>) => void;
}

export function ControlPanel({
    config,
    setConfig,
    connected,
    onConnect,
    onDisconnect,
    onSend,
    onOpenScripting,
    onOpenPortSharing,
    sendConfig,
    onSendConfigChange,
    ui,
    onUiUpdate,
}: ControlPanelProps) {
    // --- Settings Logic ---
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Settings Popover positioning
    const settingsRef = useRef<HTMLButtonElement>(null);
    const [settingsPos, setSettingsPos] = useState({ left: 0, bottom: 0 });

    // Baud Popover positioning
    const [showBaud, setShowBaud] = useState(false);
    const baudRef = useRef<HTMLButtonElement>(null);
    const [baudPos, setBaudPos] = useState({ left: 0, bottom: 0 });

    const configRef = useRef(config);
    useEffect(() => {
        configRef.current = config;
    }, [config]);

    const refreshPorts = async () => {
        setLoading(true);
        try {
            const availablePorts = await SerialService.getPorts();
            setPorts(availablePorts);
            // Auto-select first ONLY if none is currently configured.
            // Do NOT auto-switch if the configured port is missing/invalid, as it might be temporary 
            // or a virtual port that appears later. Keep user selection stable.
            // Use ref to check the LATEST config, avoiding closure staleness issues
            if (availablePorts.length > 0 && !configRef.current.port_name) {
                handleChange("port_name", availablePorts[0].port_name);
            }
        } catch (error) {
            console.error("Failed to list ports:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Script State Tracking ---
    const [scriptState, setScriptState] = useState({
        tx: ScriptService.txState,
        rx: ScriptService.rxState
    });

    useEffect(() => {
        const handler = () => {
            setScriptState({
                tx: ScriptService.txState,
                rx: ScriptService.rxState
            });
        };
        ScriptService.addEventListener('change', handler);
        return () => ScriptService.removeEventListener('change', handler);
    }, []);

    const hasTxScript = scriptState.tx.type !== null && !!scriptState.tx.content;
    const hasRxScript = scriptState.rx.type !== null && !!scriptState.rx.content;
    const isScriptActive = hasTxScript || hasRxScript;

    useEffect(() => {
        refreshPorts();
    }, []);

    const handleChange = (key: keyof SerialConfig, value: string | number) => {
        setConfig({ ...config, [key]: value });
    };

    // --- Input Logic ---
    // Use local state for immediate feedback, sync to config on debounce/blur
    const [input, setInput] = useState(ui.inputDraft);
    const [historyIndex, setHistoryIndex] = useState(-1);



    // Sync input from props if it changes externally (e.g. reload)
    useEffect(() => {
        if (input !== ui.inputDraft) {
            // Only update if significantly different to avoid cursor jumping if we were to sync constantly
            // Actually, for a draft, we probably just want to initialize it.
            // But if we want it to be truly persistent across reloads, initializing useState is enough.
            // If we want two windows to sync, we'd need more complex logic.
            // For now, let's just trust initial state.
        }
    }, []);

    // Debounce update draft
    useEffect(() => {
        const timer = setTimeout(() => {
            if (input !== ui.inputDraft) {
                onUiUpdate({ inputDraft: input });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [input, onUiUpdate, ui.inputDraft]);


    // Derived values for convenience
    const isHex = sendConfig?.hexMode ?? false;
    const appendMode = sendConfig?.appendMode ?? 'None';
    const history = ui.inputHistory;

    const handleSend = () => {
        if (!input) return;

        // Update History
        let newHistory = history;
        if (history.length === 0 || history[history.length - 1] !== input) {
            newHistory = [...history, input];
            if (newHistory.length > 50) newHistory = newHistory.slice(newHistory.length - 50);
            onUiUpdate({ inputHistory: newHistory });
        }

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
            <div className="flex items-center gap-1.5 p-1.5 border-b border-border/50 text-xs overflow-hidden">
                {/* Scrollable Container for Settings */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                    {/* Port Selection (Custom Dropdown) */}
                    <div className="relative flex-shrink-0">
                        <button
                            onClick={() => refreshPorts()} // Primary action left click: refresh & open? No, let's keep refresh separate.
                            className="hidden" // Placeholder
                        />
                        <div className="flex items-center gap-1">
                            <PortSelect
                                value={config.port_name}
                                onChange={(val) => handleChange("port_name", val)}
                                ports={ports}
                            />
                            <button
                                onClick={refreshPorts}
                                className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background hover:bg-accent disabled:opacity-50 flex-shrink-0"
                                title="Refresh Ports"
                            >
                                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {/* Baud */}
                    {/* Baud Rate (Custom Dropdown) */}
                    <div className="relative flex-shrink-0">
                        <button
                            ref={baudRef}
                            onClick={() => {
                                if (!showBaud && baudRef.current) {
                                    const rect = baudRef.current.getBoundingClientRect();
                                    setBaudPos({
                                        left: rect.left,
                                        bottom: window.innerHeight - rect.top + 5
                                    });
                                }
                                setShowBaud(!showBaud);
                            }}
                            className="h-7 w-24 flex items-center justify-between rounded border border-input bg-background px-2 text-xs outline-none hover:bg-accent"
                            title="Baud Rate"
                        >
                            <span>{config.baud_rate}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                        </button>

                        {showBaud && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowBaud(false)}
                                />
                                <div
                                    className="fixed z-50 w-24 max-h-[300px] overflow-y-auto p-1 bg-popover border border-border rounded shadow-md flex flex-col gap-0.5"
                                    style={{
                                        left: baudPos.left,
                                        bottom: baudPos.bottom
                                    }}
                                >
                                    {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => (
                                        <button
                                            key={rate}
                                            onClick={() => {
                                                handleChange("baud_rate", rate);
                                                setShowBaud(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-2 py-1 rounded-sm text-xs hover:bg-accent hover:text-accent-foreground",
                                                config.baud_rate === rate && "bg-accent/50 font-medium"
                                            )}
                                        >
                                            {rate}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Extra Settings (Compact Popover) */}
                    <div className="relative flex items-center border-l border-r border-border/50 px-2 mx-1 flex-shrink-0">
                        <button
                            ref={settingsRef}
                            onClick={() => {
                                if (!showConfig && settingsRef.current) {
                                    const rect = settingsRef.current.getBoundingClientRect();
                                    // Open upwards by default (above the toolbar)
                                    setSettingsPos({
                                        left: rect.left,
                                        bottom: window.innerHeight - rect.top + 5 // 5px gap
                                    });
                                }
                                setShowConfig(!showConfig);
                            }}
                            className="h-7 px-2 rounded border border-input bg-background hover:bg-accent flex items-center gap-1 text-xs font-mono"
                            title="Serial Configuration (Data Bits, Parity, Timeout)"
                        >
                            {config.data_bits}
                            {config.parity === 'None' ? 'N' : config.parity.charAt(0)}
                            {config.stop_bits}
                            <ChevronDown className="h-3 w-3 opacity-50" />
                        </button>

                        {showConfig && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowConfig(false)}
                                />
                                <div
                                    className="fixed z-50 min-w-[140px] p-2 bg-popover border border-border rounded shadow-md flex flex-col gap-2"
                                    style={{
                                        left: settingsPos.left,
                                        bottom: settingsPos.bottom
                                    }}
                                >
                                    <label className="text-[10px] text-muted-foreground font-medium">Data Bits</label>
                                    <select
                                        className="h-7 w-full rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                                        value={config.data_bits}
                                        onChange={(e) => handleChange("data_bits", parseInt(e.target.value))}
                                    >
                                        {[5, 6, 7, 8].map(b => <option key={b} value={b}>{b} bit</option>)}
                                    </select>

                                    <label className="text-[10px] text-muted-foreground font-medium">Stop Bits</label>
                                    <select
                                        className="h-7 w-full rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                                        value={config.stop_bits}
                                        onChange={(e) => handleChange("stop_bits", parseInt(e.target.value))}
                                    >
                                        <option value={1}>1 stop</option>
                                        <option value={2}>2 stop</option>
                                    </select>

                                    <label className="text-[10px] text-muted-foreground font-medium">Parity</label>
                                    <select
                                        className="h-7 w-full rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                                        value={config.parity}
                                        onChange={(e) => handleChange("parity", e.target.value)}
                                    >
                                        <option value="None">No Parity</option>
                                        <option value="Odd">Odd</option>
                                        <option value="Even">Even</option>
                                    </select>

                                    <label className="text-[10px] text-muted-foreground font-medium" title="Frame break timeout in milliseconds">Break (ms)</label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            className="h-7 w-full rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                                            value={config.timeout || 10}
                                            min={1}
                                            max={1000}
                                            onChange={(e) => handleChange("timeout", parseInt(e.target.value) || 10)}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Port Sharing Toggle */}
                    <div className="ml-auto flex-shrink-0">
                        {/* Force ml-auto here to push sharing and scripts to the right OF THIS CONTAINER, 
                             so they are the first to be clipped when container shrinks? 
                             Wait, if container shrinks, the right side is clipped usually if direction is ltr? 
                             Actually if it is a flex-row, and we shrink, items wrap if flex-wrap or shrink if flex-shrink.
                             We have min-w-0 on container. Content will overflow. 
                             Usually right side clips. So the "Rightmost" items in the container (Share, Script) will disappear first? 
                             Or simply they will be cut off.
                         */}
                        <PortSharingToggle
                            onClick={onOpenPortSharing}
                        />
                    </div>


                    {/* Scripting Button with Active Indicators */}
                    <div className="flex-shrink-0">
                        {!isScriptActive ? (
                            <button
                                onClick={onOpenScripting}
                                className="h-7 px-3 rounded flex items-center gap-1.5 text-xs font-medium transition-colors border shadow-sm bg-white hover:bg-gray-50 text-gray-700 border-gray-300"
                                title="Scripting Configuration"
                            >
                                <span>Script</span>
                            </button>
                        ) : (
                            <div className="flex items-center h-7 rounded border border-blue-200 bg-blue-50/50 shadow-sm overflow-hidden">
                                {/* Label Part */}
                                <button
                                    onClick={onOpenScripting}
                                    className="h-full px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100/50 transition-colors flex items-center"
                                    title="Scripting Configuration"
                                >
                                    Script
                                </button>

                                {/* Divider */}
                                <div className="h-4 w-[1px] bg-blue-200/50" />

                                {/* Indicators Part */}
                                <div className="flex flex-col justify-center h-full px-1 gap-[1px]" onClick={onOpenScripting}>
                                    {hasTxScript && (
                                        <span className={cn(
                                            "text-[9px] font-bold px-1 rounded leading-none py-[0.5px]",
                                            scriptState.tx.type === 'js'
                                                ? "text-blue-700 bg-blue-100"
                                                : "text-purple-700 bg-purple-100"
                                        )} title={`TX Hook: ${scriptState.tx.type === 'js' ? 'JavaScript' : 'External Command'}`}>
                                            TX
                                        </span>
                                    )}
                                    {hasRxScript && (
                                        <span className={cn(
                                            "text-[9px] font-bold px-1 rounded leading-none py-[0.5px]",
                                            scriptState.rx.type === 'js'
                                                ? "text-blue-700 bg-blue-100"
                                                : "text-purple-700 bg-purple-100"
                                        )} title={`RX Hook: ${scriptState.rx.type === 'js' ? 'JavaScript' : 'External Command'}`}>
                                            RX
                                        </span>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="h-4 w-[1px] bg-blue-200/50" />

                                {/* Stop Button */}
                                <button
                                    onClick={() => ScriptService.clearAll()}
                                    className="h-full px-1.5 hover:bg-red-100 text-blue-400 hover:text-red-500 transition-colors flex items-center justify-center"
                                    title="Stop All Scripts"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Connect Button - Fixed outside the scrollable container */}
                <button
                    onClick={connected ? onDisconnect : onConnect}
                    className={cn(
                        "h-7 px-3 rounded flex items-center gap-1.5 font-medium transition-colors text-white shadow-sm flex-shrink-0 ml-auto",
                        connected ? "bg-red-500 hover:bg-red-600" : "bg-green-600 hover:bg-green-700"
                    )}
                >
                    {connected ? <><Link2Off className="w-3.5 h-3.5" /> Disconnect</> : <><Link className="w-3.5 h-3.5" /> Connect</>}
                </button>
            </div>

            {/* Bottom Row: Input & Send */}
            {/* Bottom Row: Input & Send */}
            <div className="flex items-center gap-2 p-1.5 bg-background overflow-hidden relative">
                <div className="flex-shrink overflow-hidden flex items-center min-w-0">
                    <HexSwitch
                        checked={isHex}
                        onChange={(val) => onSendConfigChange({ hexMode: val })}
                        size="sm"
                        className="flex-shrink-0"
                    />
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isHex ? "Enter Hex (e.g. AA BB CC)" : "Enter text to send... (↑/↓ for history)"}
                            className={cn(
                                "w-full h-7 px-2 text-xs border border-input rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary",
                                isHex && "font-mono"
                            )}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 bg-white rounded-sm pl-1">
                            <select
                                value={appendMode}
                                onChange={(e) => onSendConfigChange({ appendMode: e.target.value as any })}
                                className="h-6 text-[10px] bg-transparent border-none text-muted-foreground focus:ring-0 cursor-pointer hover:bg-black/5 rounded px-1"
                                title="Line Ending"
                            >
                                <option value="None">None</option>
                                <option value="LF">\n</option>
                                <option value="CR">\r</option>
                                <option value="CRLF">\r\n</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink overflow-hidden flex items-center min-w-0">
                    <button
                        onClick={handleSend}
                        disabled={!connected || !input}
                        className="h-7 px-4 bg-primary text-primary-foreground rounded shadow hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 font-medium transition-colors text-xs flex-shrink-0"
                    >
                        Send <Send className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
