import { useState, useEffect, useCallback } from "react";
import { PortSharingService, SharingStatus } from "../services/ipc";
import { cn } from "../lib/utils";
import { Share2, AlertTriangle, X } from "lucide-react";

interface PortSharingToggleProps {
    /** 点击回调 (打开管理弹窗) */
    onClick: () => void;
}

export function PortSharingToggle({ onClick }: PortSharingToggleProps) {
    const [status, setStatus] = useState<SharingStatus>({
        enabled: false,
        port_pairs: [],
        physical_port: null
    });
    const [com0comInstalled, setCom0comInstalled] = useState<boolean | null>(null);
    const [hub4comInstalled, setHub4comInstalled] = useState<boolean | null>(null);

    // Check dependencies
    useEffect(() => {
        PortSharingService.isCom0comInstalled().then(setCom0comInstalled);
        PortSharingService.isHub4comInstalled().then(setHub4comInstalled);
    }, []);

    // Refresh status periodically or on mount
    const refreshStatus = useCallback(async () => {
        try {
            const s = await PortSharingService.getSharingStatus();
            setStatus(s);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        refreshStatus();
        const interval = setInterval(refreshStatus, 2000); // Simple polling to keep sync
        return () => clearInterval(interval);
    }, [refreshStatus]);

    const handleStopSharing = async () => {
        try {
            await PortSharingService.stopSharing();
            refreshStatus();
        } catch (e) {
            console.error(e);
        }
    };

    // Dependencies warning
    if (com0comInstalled === false || hub4comInstalled === false) {
        return (
            <button
                onClick={onClick}
                className="flex items-center gap-1.5 px-2 py-1 h-7 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                title="Components missing, click to manage"
            >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Shared Port Setup</span>
            </button>
        )
    }

    if (com0comInstalled === null) return null;

    return (
        <div className="flex items-center gap-2">
            {!status.enabled ? (
                <button
                    onClick={onClick}
                    className="h-7 px-3 rounded flex items-center gap-1.5 text-xs font-medium transition-colors border shadow-sm bg-white hover:bg-gray-50 text-gray-700 border-gray-300"
                    title="Share Port"
                >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Share Port</span>
                </button>
            ) : (
                <div className="flex items-center h-7 rounded border border-purple-200 bg-purple-50/50 shadow-sm overflow-hidden">
                    {/* Label Part */}
                    <button
                        onClick={onClick}
                        className="h-full px-2 text-xs font-semibold text-purple-700 hover:bg-purple-100/50 transition-colors flex items-center gap-1.5"
                        title="Sharing Active - Click to Manage"
                    >
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Sharing</span>
                    </button>

                    {/* Divider */}
                    <div className="h-4 w-[1px] bg-purple-200/50" />

                    {/* Ports Display */}
                    <button
                        onClick={onClick}
                        className="h-full px-2 text-xs text-purple-600 hover:bg-purple-100/50 transition-colors flex items-center font-medium max-w-[150px] truncate"
                        title="Manage Ports"
                    >
                        {status.port_pairs.length > 0 ? status.port_pairs.map(p => p.port_a).join(', ') : 'No Ports'}
                    </button>

                    {/* Divider */}
                    <div className="h-4 w-[1px] bg-purple-200/50" />

                    {/* Stop Button */}
                    <button
                        onClick={handleStopSharing}
                        className="h-full px-1.5 hover:bg-red-100 text-purple-400 hover:text-red-500 transition-colors flex items-center justify-center"
                        title="Stop Sharing"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
