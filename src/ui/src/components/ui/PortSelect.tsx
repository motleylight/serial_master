
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react"; // Make sure to import these in ControlPanel too or just copy this whole component
import { cn } from "../../lib/utils";
import { SerialPortInfo } from "../../services/ipc";

interface PortSelectProps {
    value: string;
    onChange: (value: string) => void;
    ports: SerialPortInfo[];
}

export function PortSelect({ value, onChange, ports }: PortSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedPort = ports.find(p => p.port_name === value);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="h-7 w-20 flex items-center justify-between rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary hover:bg-accent/50"
                title={selectedPort?.product_name || value} // Tooltip still shows full name
            >
                <span className="truncate">{value || "Select"}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-64 max-h-60 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md z-50">
                    {ports.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No ports found</div>
                    ) : (
                        ports.map((port) => (
                            <button
                                key={port.port_name}
                                onClick={() => {
                                    onChange(port.port_name);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "relative w-full flex flex-col items-start rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground outline-none",
                                    value === port.port_name && "bg-accent/50"
                                )}
                            >
                                <div className="flex items-center w-full">
                                    <span className="font-medium">{port.port_name}</span>
                                    {value === port.port_name && <Check className="ml-auto h-3 w-3" />}
                                </div>
                                {port.product_name && (
                                    <span className="text-[10px] text-muted-foreground whitespace-normal break-words w-full">
                                        {port.product_name}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
