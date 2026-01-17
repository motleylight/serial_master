import React, { useState, useEffect } from 'react';
import { PortSharingService, PortPair, SharingStatus, SerialService, SerialPortInfo } from '../services/ipc';
import { cn } from '../lib/utils';
import {
    X, Activity, Trash2, Edit2, Check, Plus,
    Share2, AlertTriangle, Monitor, Cable,
    RefreshCw, Zap, ArrowRight, ArrowLeftRight
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

        // Styles
        const containerClass = cn("border rounded-xl p-4 flex flex-col gap-3 relative transition-all bg-white/50",
            isSharing ? "border-primary/50 bg-primary/5" : "border-border border-dashed"
        );
        const appBoxClass = cn("border border-dashed rounded-xl p-3 flex flex-col justify-center items-center gap-2 bg-white/50 h-24 min-w-[140px] relative transition-all",
            isSharing ? "border-green-500/50 bg-green-500/5" : "border-border"
        );

        if (activePairs.length === 0) {
            return (
                <div className="w-full h-full flex items-center justify-center p-8 bg-muted/5 rounded-lg border border-border text-muted-foreground flex-col gap-3">
                    <Cable className="w-10 h-10 opacity-20" />
                    <span>Select clone ports to view topology</span>
                </div>
            );
        }

        return (
            <div className="w-full h-full p-8 overflow-auto flex items-center justify-center bg-muted/5">
                <div className="flex items-start justify-center gap-0 min-w-[800px]">
                    {/* LEFT: SerialMaster Container (Horizontal Layout) */}
                    <div className={cn(containerClass, "flex-row items-center gap-0 pr-0 min-w-0")}>
                        <div className="absolute -top-3 left-4 bg-background px-2 text-xs font-bold text-muted-foreground flex items-center gap-1 border border-border rounded-full shadow-sm z-30">
                            <Zap className="w-3 h-3 fill-current" />
                            SerialMaster
                        </div>

                        {/* 1. Physical Port (Left) */}
                        <div className="flex flex-col justify-center z-20">
                            <div className={cn("w-32 min-h-[4rem] border rounded bg-background flex flex-col items-center justify-center shadow-sm text-center relative z-10 py-1",
                                isSharing ? "border-primary shadow-primary/20" : "border-border"
                            )}>
                                <span className="text-sm font-mono">{physicalDetails.name}</span>
                                <span className="text-[9px] text-muted-foreground w-full px-1 leading-tight break-words">{physicalDetails.desc}</span>
                                {/* Dot Right */}
                                <div className={cn("absolute -right-1 w-2 h-2 rounded-full border border-white top-1/2 -translate-y-1/2", isSharing ? "bg-primary" : "bg-muted")} />
                            </div>
                        </div>

                        {/* 2. Link Physical -> Bridge */}
                        <div className={cn("w-16 h-[2px] relative flex items-center justify-center", isSharing ? "bg-primary" : "bg-border")}>
                            {isSharing && <ArrowRight className="w-3 h-3 text-primary absolute -top-4" />}
                        </div>

                        {/* 3. Bridge Node (Center) */}
                        <div className="relative flex flex-col items-center justify-center z-20">
                            <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 shadow-sm bg-background relative z-10",
                                isSharing ? "border-primary text-primary shadow-primary/10 ring-2 ring-primary/5" : "border-border text-muted-foreground"
                            )}>
                                <RefreshCw className={cn("w-3 h-3", isSharing && "text-primary animate-spin-slow")} />
                                <span>Bridge</span>
                            </div>
                            {/* Pass-through Label (Above Bridge) */}
                            {isSharing && (
                                <div className="absolute -top-8 whitespace-nowrap text-[9px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                    Pass-through
                                </div>
                            )}
                        </div>

                        {/* 4. Link Bridge -> Virtual List Wrapper */}
                        <div className={cn("w-16 h-[2px] relative flex items-center justify-center", isSharing ? "bg-primary" : "bg-border")}>
                            {isSharing && <ArrowRight className="w-3 h-3 text-primary absolute -top-4" />}
                        </div>

                        {/* 5. Virtual Ports List (Right side of Box) */}
                        <div className="flex flex-col gap-6 relative">
                            {/* Spine Component for multiple items */}
                            {activePairs.length > 1 && (
                                <div className={cn("absolute left-[-2px] w-[2px]", isSharing ? "bg-primary" : "bg-border")}
                                    style={{
                                        top: '3rem', // Center of first item (h-24/2 = 3rem)
                                        bottom: '3rem' // Center of last item
                                    }}
                                />
                            )}

                            {activePairs.map((pair) => (
                                <div key={pair.pair_id} className="h-24 flex items-center relative pl-4">
                                    {/* Horizontal Branch from Spine to Item */}
                                    <div className={cn("absolute left-[-2px] w-4 h-[2px]",
                                        isSharing ? "bg-primary" : "bg-border"
                                    )}
                                        style={{ top: '50%' }}
                                    />

                                    {/* Virtual A Box */}
                                    <div className={cn("w-32 h-14 border rounded bg-background flex flex-col items-center justify-center shadow-sm text-sm font-mono relative z-10",
                                        isSharing ? "border-purple-400 shadow-purple-500/20" : "border-border"
                                    )}>
                                        {pair.port_a}
                                        <span className="text-[9px] text-muted-foreground bg-muted/30 px-1 rounded mt-0.5">Virtual</span>
                                        {/* Connector Left (Input) */}
                                        <div className={cn("absolute -left-1 w-2 h-2 rounded-full border border-white top-1/2 -translate-y-1/2", isSharing ? "bg-purple-500" : "bg-muted")} />

                                        {/* Connector Right (Output to com0com) */}
                                        <div className={cn("absolute -right-1.5 w-3 h-3 rounded-full border-2 border-white top-1/2 -translate-y-1/2", isSharing ? "bg-purple-500" : "bg-muted")} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* MIDDLE: com0com Links */}
                    <div className="flex flex-col gap-6 relative w-32 pt-4 shrink-0">
                        {activePairs.map((pair) => (
                            <div key={pair.pair_id} className="h-24 relative flex items-center justify-center">
                                {/* Cable Line - positioned to bridge left gap */}
                                {/* left-[-24px] bridges the gap into SerialMaster (p-4 = 16px + buffer) */}
                                <div className={cn("absolute h-[2px] top-1/2 -translate-y-1/2",
                                    isSharing ? "bg-purple-500/50" : "bg-border",
                                    "-left-6 w-[calc(100%+24px)]"
                                )}>
                                    {isSharing && <div className="absolute inset-0 bg-purple-400 animate-pulse opacity-50" />}

                                    {/* com0com Badge - Centered on the line */}
                                    <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 bg-background px-2 py-1 rounded-full border border-border shadow-sm flex items-center gap-1.5">
                                        <ArrowLeftRight className={cn("w-3 h-3", isSharing ? "text-purple-500" : "text-muted-foreground")} />
                                        <span className="text-[10px] font-mono text-muted-foreground font-medium">com0com</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* RIGHT: App Containers (Occupies Virtual B) */}
                    <div className="flex flex-col gap-6 pt-4 pl-4">
                        {activePairs.map((pair) => (
                            <div key={pair.pair_id} className={appBoxClass}>
                                <div className={cn("absolute -top-3 left-4 bg-background px-2 text-xs font-bold flex items-center gap-1 border border-border rounded-full shadow-sm z-30",
                                    isSharing ? "border-green-200" : "text-muted-foreground"
                                )} style={{ color: isSharing ? '#000000' : undefined }}>
                                    <Monitor className="w-3 h-3 fill-current" />
                                    3rd Party App
                                </div>

                                {/* Virtual B Box */}
                                <div className={cn("w-32 h-14 border rounded bg-background flex flex-col items-center justify-center shadow-sm text-sm font-mono relative z-10",
                                    isSharing ? "border-green-500 shadow-green-500/20" : "border-border"
                                )}>
                                    {pair.port_b}
                                    <span className="text-[9px] text-muted-foreground">Virtual</span>
                                    {/* Connector Left */}
                                    <div className={cn("absolute -left-1.5 w-3 h-3 rounded-full border-2 border-white top-1/2 -translate-y-1/2", isSharing ? "bg-green-500" : "bg-muted")} />
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
                        <div className="flex-1 min-h-0 flex flex-col gap-6">
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
