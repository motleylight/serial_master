
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
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Fixed positioning state
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Calculate position when opening
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            // Default: open upwards if space allows? Or downwards?
            // "absolute bottom-full" -> Upwards.
            // Let's stick to upwards.
            setDropdownStyle({
                position: 'fixed',
                left: rect.left,
                bottom: window.innerHeight - rect.top + 4, // 4px gap
                width: '16rem', // w-64
                zIndex: 50
            });
        }
    }, [isOpen]);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                // Check if click is inside the portal/fixed dropdown (which is outside containerRef in DOM if we portal, but here it is just fixed)
                // Since it is fixed but lexically inside the component, event bubbling might still work?
                // Wait, if it is fixed, `contains` still works if it is in the React tree? 
                // Yes, React event delegation handles it, but Native DOM `contains`...
                // If the fixed div is a child of containerRef in DOM structure, `contains` works.
                // Just changing CSS position doesn't move it in DOM. So `contains` works!
                true
            ) {
                setIsOpen(false);
            }
        };
        // Actually, we need to be careful. React `createPortal` moves it in DOM. 
        // But `position: fixed` keeps it in DOM hierarchy. 
        // So `containerRef.current.contains(target)` IS valid.

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ... (focus effect remains same)

    const selectedPort = ports.find(p => p.port_name === value);

    const filteredPorts = ports.filter(p =>
        p.port_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.product_name && p.product_name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="h-7 w-20 flex items-center justify-between rounded border border-input bg-background px-2 text-xs outline-none hover:bg-accent/50"
                title={selectedPort?.product_name || value}
            >
                <span className="truncate">{value || "Select"}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
            </button>

            {isOpen && (
                <div
                    className="flex flex-col max-h-[300px] overflow-hidden rounded-md border border-border bg-popover shadow-md"
                    style={dropdownStyle}
                >
                    {/* Search Input */}
                    <div className="p-1 border-b border-border/50">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search ports..."
                            className="w-full h-6 px-2 text-xs bg-muted/20 border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div className="overflow-auto p-1 flex-1">
                        {filteredPorts.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No ports found</div>
                        ) : (
                            filteredPorts.map((port) => (
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
                </div>
            )}
        </div>
    );
}
