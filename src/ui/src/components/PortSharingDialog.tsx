import React, { useState, useEffect } from 'react';
import { PortSharingService, PortPair, SharingStatus, SerialService, SerialPortInfo } from '../services/ipc';
import { cn } from '../lib/utils';
import {
    X, Activity, Trash2, Edit2, Check, Plus,
    Share2, AlertTriangle, Monitor, Cable,
    RefreshCw, Zap
} from "lucide-react";
// We keep the CSS import if there are global styles or animations we missed, 
// but currently it should be mostly handled by Tailwind.
import './PortSharingDialog.css';

interface PortSharingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onShareStart?: () => void;
    onShareStop?: () => void;
    currentPhysicalPort?: string;
    currentBaudRate?: number;
}

export const PortSharingDialog: React.FC<PortSharingDialogProps> = ({
    isOpen,
    onClose,
    onShareStart,
    onShareStop,
    currentPhysicalPort,
    currentBaudRate
}) => {
    const [activeTab, setActiveTab] = useState<'share' | 'manage'>('share');
    const [status, setStatus] = useState<SharingStatus | null>(null);
    const [pairs, setPairs] = useState<PortPair[]>([]);
    const [selectedPhysicalPort, setSelectedPhysicalPort] = useState<string>(currentPhysicalPort || '');
    const [allPorts, setAllPorts] = useState<SerialPortInfo[]>([]);

    // Selection for sharing
    const [selectedPairIds, setSelectedPairIds] = useState<number[]>([]);

    // Create/Edit state
    const [editingPair, setEditingPair] = useState<Partial<PortPair> | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [com0comInstalled, setCom0comInstalled] = useState<boolean>(false);
    const [hub4comInstalled, setHub4comInstalled] = useState<boolean>(false);

    useEffect(() => {
        if (isOpen) {
            checkDependencies();
            loadPorts();
            loadStatus();
        }
    }, [isOpen]);

    const checkDependencies = async () => {
        const c0c = await PortSharingService.isCom0comInstalled();
        const h4c = await PortSharingService.isHub4comInstalled();
        setCom0comInstalled(c0c);
        setHub4comInstalled(h4c);
    };

    // Slow operation - only run on mount
    const loadPorts = async () => {
        try {
            const portsList = await SerialService.getPorts();
            setAllPorts(portsList);
        } catch (err: any) {
            console.error("Failed to load ports", err);
        }
    };

    // Fast operation - run on actions
    const loadStatus = async () => {
        setLoading(true);
        try {
            const [s, p] = await Promise.all([
                PortSharingService.getSharingStatus(),
                PortSharingService.getVirtualPairs()
            ]);
            setStatus(s);
            setPairs(p);

            // If local state is empty, sync from status
            if (s.enabled && s.physical_port) {
                setSelectedPhysicalPort(s.physical_port);
                // Only overwrite if completely empty to avoid overwriting user selection during setup
                // But generally we want to show what IS shared
                if (selectedPairIds.length === 0) {
                    setSelectedPairIds(s.port_pairs.map(pair => pair.pair_id));
                }
            }
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    // Auto-create logic - run once when data is loaded and empty
    useEffect(() => {
        if (com0comInstalled && !loading && pairs.length === 0 && !status?.enabled && isOpen) {
            const timer = setTimeout(() => {
                // Check again inside timeout to be sure
                // We rely on the pairs state being updated
                if (pairs.length === 0) {
                    handleCreatePair();
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [com0comInstalled, pairs.length, status?.enabled, isOpen]);

    const handleStartSharing = async () => {
        setLoading(true);
        setError(null);
        try {
            const baud = currentBaudRate || 115200;
            await PortSharingService.startSharing(selectedPhysicalPort, selectedPairIds, baud);
            await loadStatus();
            if (onShareStart) onShareStart();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleStopSharing = async () => {
        setLoading(true);
        setError(null);
        try {
            await PortSharingService.stopSharing();
            await loadStatus();
            if (onShareStop) onShareStop();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePair = async () => {
        setLoading(true);
        try {
            await PortSharingService.createVirtualPair("-", "-");
            await loadStatus();
            setEditingPair(null);
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleRemovePair = async (id: number) => {
        if (!confirm('确定要删除这个克隆端口吗？这将移除对应的虚拟串口对。')) return;
        setLoading(true);
        try {
            await PortSharingService.removeVirtualPair(id);
            setSelectedPairIds(prev => prev.filter(pid => pid !== id));
            await loadStatus();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleRename = async (id: number, nameA: string, nameB: string) => {
        setLoading(true);
        try {
            await PortSharingService.renameVirtualPair(id, nameA, nameB);
            setEditingPair(null);
            await loadStatus();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    }

    const getPortDetails = (portName: string | undefined) => {
        if (!portName) return { name: "Not Connected", desc: "" };
        const info = allPorts.find(p => p.port_name === portName);
        return {
            name: portName,
            desc: info?.product_name || "Serial Device"
        };
    };

    if (!isOpen) return null;

    const physicalDetails = getPortDetails(currentPhysicalPort);

    // --- Sub-components --

    const PairsList = () => (
        <div className="border border-border rounded-md overflow-hidden bg-muted/10">
            {pairs.length === 0 && (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <Cable className="w-8 h-8 opacity-20" />
                    <span>暂无克隆端口 (No Clone Ports)</span>
                    <button
                        onClick={handleCreatePair}
                        disabled={loading}
                        className="text-primary hover:underline text-sm"
                    >
                        点击新建 (Create New)
                    </button>
                </div>
            )}
            {pairs.map((pair) => (
                <div key={pair.pair_id} className={cn(
                    "flex items-center p-3 gap-3 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors",
                    selectedPairIds.includes(pair.pair_id) && "bg-primary/5"
                )}>
                    {/* Checkbox */}
                    <div className="flex items-center h-5">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                            checked={selectedPairIds.includes(pair.pair_id)}
                            onChange={(e) => {
                                if (e.target.checked) setSelectedPairIds([...selectedPairIds, pair.pair_id]);
                                else setSelectedPairIds(selectedPairIds.filter(id => id !== pair.pair_id));
                            }}
                            disabled={status?.enabled}
                        />
                    </div>

                    {/* Icon */}
                    <div className="text-muted-foreground">
                        <Cable className="w-4 h-4" />
                    </div>

                    {/* Name */}
                    <div className="flex-1 text-sm">
                        {editingPair?.pair_id === pair.pair_id ? (
                            <div className="flex items-center gap-2">
                                <input
                                    className="h-7 px-2 border border-primary rounded bg-background text-foreground w-24 font-mono"
                                    defaultValue={pair.port_a}
                                    id={`rename-${pair.pair_id}`}
                                    autoFocus
                                />
                                <span className="text-muted-foreground text-xs">&lt;-&gt; {pair.port_b} (Internal)</span>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground font-mono">{pair.port_a}</span>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded h-4 flex items-center">Clone</span>
                                </div>
                                <div className="text-xs text-muted-foreground" title={getPortDetails(pair.port_a).desc}>
                                    {getPortDetails(pair.port_a).desc}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    {!status?.enabled && (
                        <div className="flex items-center gap-1">
                            {editingPair?.pair_id === pair.pair_id ? (
                                <>
                                    <button
                                        onClick={() => {
                                            const el = document.getElementById(`rename-${pair.pair_id}`) as HTMLInputElement;
                                            handleRename(pair.pair_id, el.value, pair.port_b);
                                        }}
                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                        title="Save"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setEditingPair(null)}
                                        className="p-1.5 text-muted-foreground hover:bg-muted rounded"
                                        title="Cancel"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setEditingPair(pair)}
                                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                                        title="Rename"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleRemovePair(pair.pair_id)}
                                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    // --- Topology Components ---

    const TopologyDiagram = () => {
        const activePairs = pairs.filter(p => selectedPairIds.includes(p.pair_id));
        const isSharing = status?.enabled;

        // Colors
        const activeColorBg = isSharing ? "bg-green-500" : "bg-muted-foreground/30";
        const strokeColor = isSharing ? "#22c55e" : "#e5e7eb"; // green-500 vs gray-200

        if (activePairs.length === 0) {
            return (
                <div className="w-full h-full flex items-center justify-center p-8 bg-muted/5 rounded-lg border border-border">
                    <div className="flex flex-col items-center justify-center text-muted-foreground/50 text-center gap-2">
                        <Cable className="w-8 h-8 opacity-20" />
                        <span className="text-sm">Please select clone ports to view topology</span>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full h-full p-6 overflow-auto bg-white/50 flex items-center justify-center">
                <div className="flex items-stretch gap-0 relative">

                    {/* LEFT: Physical Port (Vertically Centered) */}
                    <div className="flex flex-col justify-center z-20">
                        <div className={cn("w-36 h-20 border rounded-lg bg-white flex flex-col items-center justify-center shadow-sm relative transition-all",
                            isSharing ? "border-green-500 shadow-green-500/10" : "border-muted-foreground/30"
                        )}>
                            <div className="font-bold font-mono text-sm mb-1">{physicalDetails.name}</div>
                            <div className="text-[10px] text-muted-foreground text-center px-2 leading-tight">{physicalDetails.desc}</div>
                            {/* Connector Dot Right */}
                            <div className={cn("absolute -right-1.5 w-3 h-3 rounded-full border-2 border-white", activeColorBg, "top-1/2 -translate-y-1/2")} />
                        </div>
                    </div>

                    {/* MIDDLE: SVG Branching Area */}
                    <div className="w-24 relative shrink-0 flex items-center justify-center">
                        {/* SerialMaster Badge - Matched Style to com0com */}
                        <div className="absolute z-30 bg-white border px-1.5 py-0.5 rounded text-[9px] font-mono shadow-sm whitespace-nowrap"
                            style={{
                                borderColor: isSharing ? '#22c55e' : '#e5e7eb', // green-500 : border
                                color: isSharing ? '#15803d' : '#6b7280', // green-700 : muted-foreground
                            }}
                        >
                            SerialMaster
                        </div>

                        {/* SVG Connections */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ overflow: 'visible' }}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                        >
                            {activePairs.map((_, idx) => {
                                const total = activePairs.length;
                                // To draw accurately, we assume evenly spaced targets on the right.
                                // Let's rely on CSS flex alignment. 
                                // We can't easily know exact pixel positions without ref.
                                // SIMPLE TRICK: Use 0-100% logic, assuming the container height matches the right side height perfectly.
                                // Left side is centered.

                                const step = 100 / total;
                                const yTarget = (step * idx) + (step / 2);

                                return (
                                    <g key={idx}>
                                        {/* Curve from Left-Center to Right-Target */}
                                        <path
                                            d={`M 0,50 C 50,50 50,${yTarget} 100,${yTarget}`}
                                            fill="none"
                                            stroke={strokeColor}
                                            strokeWidth="2"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                        {/* "Transparent" Label on the path? Hard to center. 
                                            Fixed "Trans" label on the line is cleaner in the middle div.
                                        */}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    {/* RIGHT: Virtual Rows */}
                    <div className="flex flex-col gap-4 py-4 z-20">
                        {activePairs.map(pair => (
                            <div key={pair.pair_id} className="flex items-center gap-3 h-20">
                                {/* Virtual A */}
                                <div className={cn("w-32 h-14 border rounded bg-white flex flex-col items-center justify-center shadow-sm text-sm font-mono relative",
                                    isSharing ? "border-blue-500 shadow-blue-500/10" : "border-muted-foreground/30"
                                )}>
                                    {pair.port_a}
                                    <span className="text-[9px] text-muted-foreground font-sans">Virtual Clone</span>
                                    {/* Dot Left */}
                                    <div className={cn("absolute -left-1.5 w-3 h-3 rounded-full border-2 border-white", isSharing ? "bg-blue-500" : "bg-muted-foreground/30", "top-1/2 -translate-y-1/2")} />
                                </div>

                                {/* Link: com0com */}
                                <div className="w-20 h-[2px] bg-border relative flex items-center justify-center">
                                    <div className={cn("absolute inset-0", isSharing && "bg-blue-500 animate-pulse")} />
                                    <div className={cn("bg-white border px-1.5 py-0.5 rounded text-[9px] font-mono shadow-sm relative z-10",
                                        isSharing ? "border-blue-500 text-blue-700" : "text-muted-foreground"
                                    )}>
                                        com0com
                                    </div>
                                </div>

                                {/* Virtual B */}
                                <div className={cn("w-32 h-14 border rounded bg-white flex flex-col items-center justify-center shadow-sm text-sm font-mono relative",
                                    isSharing ? "border-blue-500 shadow-blue-500/10" : "border-muted-foreground/30"
                                )}>
                                    {pair.port_b}
                                    <span className="text-[9px] text-muted-foreground font-sans">Virtual Clone</span>
                                </div>

                                {/* Link: App (Direct Connection) */}
                                <div className="w-12 h-[2px] bg-border relative flex items-center justify-center">
                                    <div className={cn("absolute inset-0", isSharing && "bg-green-500 animate-pulse")} />
                                    {/* Removed "Trans" label */}
                                </div>

                                {/* App Node */}
                                <div className="w-28 h-14 border border-dashed border-green-500/40 bg-green-50/30 rounded flex flex-col items-center justify-center text-xs text-green-700 relative">
                                    <div className="font-semibold">3rd Party App</div>
                                    <div className="text-[9px] opacity-70">Application</div>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <div className="bg-background border border-border shadow-2xl rounded-xl w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] flex flex-col text-foreground animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-full">
                            <Share2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg leading-none">Port Sharing (Clone)</h3>
                            <p className="text-xs text-muted-foreground mt-1">Share one physical port with multiple applications</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border bg-muted/40 px-6 pt-2">
                    <button
                        onClick={() => setActiveTab('share')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'share'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        Configuration
                    </button>
                    <button
                        onClick={() => setActiveTab('manage')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'manage'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        Topology View
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative p-6">
                    {loading && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-[1px] flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                                <span className="text-sm font-medium text-muted-foreground">Processing...</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md flex items-center gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {(!com0comInstalled || !hub4comInstalled) && (
                        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="flex flex-col gap-1">
                                <span className="font-medium">Missing Dependencies</span>
                                {!com0comInstalled && <span>• com0com driver is not found. Virtual ports cannot be created.</span>}
                                {!hub4comInstalled && <span>• hub4com tool is not found. Port sharing will not work.</span>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'share' ? (
                        <div className="h-full flex flex-col gap-6">
                            {/* Source Port Section */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Source Physical Port</label>
                                <div className="flex items-center gap-3 p-3 border border-border rounded-md bg-card">
                                    <Monitor className={cn("w-5 h-5", currentPhysicalPort ? "text-primary" : "text-muted-foreground")} />
                                    <div className="flex-1">
                                        <div className="text-sm font-bold font-mono text-foreground">
                                            {physicalDetails.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {currentPhysicalPort
                                                ? `${physicalDetails.desc}`
                                                : "Connect a port in the main window first"}
                                        </div>
                                    </div>
                                    <div className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                        Primary
                                    </div>
                                </div>
                            </div>

                            {/* Clone Ports Section */}
                            <div className="flex-1 flex flex-col gap-2 min-h-0 bg-card">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Virtual Clone Ports</label>
                                    <button
                                        onClick={handleCreatePair}
                                        disabled={loading || status?.enabled}
                                        className="text-xs flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                                    >
                                        <Plus className="w-3 h-3" /> Add New Clone
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <PairsList />
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="pt-4 border-t border-border mt-auto flex justify-end gap-3">
                                {!status?.enabled ? (
                                    <button
                                        onClick={handleStartSharing}
                                        disabled={!currentPhysicalPort || selectedPairIds.length === 0}
                                        className="h-10 px-6 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md flex items-center gap-2 font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Zap className="w-4 h-4 fill-current" />
                                        Start Sharing
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleStopSharing}
                                        className="h-10 px-6 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md flex items-center gap-2 font-medium shadow-sm transition-colors"
                                    >
                                        <Activity className="w-4 h-4" />
                                        Stop Sharing
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <TopologyDiagram />
                            <div className="mt-4 p-4 bg-muted/30 rounded-lg text-sm text-muted-foreground space-y-2 border border-border/50">
                                <h4 className="font-semibold text-foreground flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    How it works
                                </h4>
                                <ul className="list-disc pl-4 space-y-1 text-xs">
                                    <li>SerialMaster maintains the exclusive connection to the physical port.</li>
                                    <li>Data received from the physical port is bridged to all active virtual clone ports.</li>
                                    <li>Any data sent to a clone port by other applications is forwarded to the physical port.</li>
                                    <li>You can connect up to 3rd party software (e.g. Serial Plotter, Terminal) to the clone ports simultaneously.</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
