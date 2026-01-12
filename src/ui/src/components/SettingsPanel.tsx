import { useState, useEffect } from "react";
import { SerialService, SerialConfig, SerialPortInfo } from "../services/ipc";
import { cn } from "../lib/utils";
import { RefreshCw, Link, Link2Off } from "lucide-react";

interface SettingsPanelProps {
    config: SerialConfig;
    setConfig: (config: SerialConfig) => void;
    connected: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
}

export function SettingsPanel({
    config,
    setConfig,
    connected,
    onConnect,
    onDisconnect,
}: SettingsPanelProps) {
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const refreshPorts = async () => {
        setLoading(true);
        try {
            const availablePorts = await SerialService.getPorts();
            setPorts(availablePorts);
            // Auto-select first port if current is empty or invalid
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

    return (
        <div className="flex flex-wrap gap-2 items-end p-2 bg-muted/30 border-b border-border text-sm">
            {/* Port Selection */}
            <div className="flex flex-col gap-1 w-32">
                <label className="text-xs text-muted-foreground font-medium ml-1">Port</label>
                <div className="flex gap-1">
                    <select
                        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={config.port_name}
                        disabled={connected}
                        onChange={(e) => handleChange("port_name", e.target.value)}
                    >
                        {ports.map((port) => (
                            <option key={port} value={port}>
                                {port}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={refreshPorts}
                        disabled={connected || loading}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50"
                        title="Refresh Ports"
                    >
                        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Baud Rate */}
            <div className="flex flex-col gap-1 w-24">
                <label className="text-xs text-muted-foreground font-medium ml-1">Baud Rate</label>
                <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={config.baud_rate}
                    disabled={connected}
                    onChange={(e) => handleChange("baud_rate", parseInt(e.target.value))}
                >
                    {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => (
                        <option key={rate} value={rate}>
                            {rate}
                        </option>
                    ))}
                </select>
            </div>

            {/* Advanced Settings Checkbox or just inline them? Inline for now as they are small */}
            <div className="flex flex-col gap-1 w-20">
                <label className="text-xs text-muted-foreground font-medium ml-1">Data Bits</label>
                <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={config.data_bits}
                    disabled={connected}
                    onChange={(e) => handleChange("data_bits", parseInt(e.target.value))}
                >
                    {[5, 6, 7, 8].map((bits) => (
                        <option key={bits} value={bits}>
                            {bits}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1 w-20">
                <label className="text-xs text-muted-foreground font-medium ml-1">Stop Bits</label>
                <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={config.stop_bits}
                    disabled={connected}
                    onChange={(e) => handleChange("stop_bits", parseInt(e.target.value))}
                >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                </select>
            </div>

            <div className="flex flex-col gap-1 w-24">
                <label className="text-xs text-muted-foreground font-medium ml-1">Parity</label>
                <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={config.parity}
                    disabled={connected}
                    onChange={(e) => handleChange("parity", e.target.value)}
                >
                    <option value="None">None</option>
                    <option value="Odd">Odd</option>
                    <option value="Even">Even</option>
                </select>
            </div>

            <div className="flex flex-col gap-1 w-24">
                <label className="text-xs text-muted-foreground font-medium ml-1">Flow Control</label>
                <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={config.flow_control}
                    disabled={connected}
                    onChange={(e) => handleChange("flow_control", e.target.value)}
                >
                    <option value="None">None</option>
                    <option value="Software">Software</option>
                    <option value="Hardware">Hardware</option>
                </select>
            </div>

            <div className="ml-auto pb-0.5">
                <button
                    onClick={connected ? onDisconnect : onConnect}
                    className={cn(
                        "h-8 px-4 rounded-md flex items-center gap-2 font-medium transition-colors text-white text-xs",
                        connected
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-green-600 hover:bg-green-700"
                    )}
                >
                    {connected ? (
                        <>
                            <Link2Off className="w-3.5 h-3.5" /> Disconnect
                        </>
                    ) : (
                        <>
                            <Link className="w-3.5 h-3.5" /> Connect
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
