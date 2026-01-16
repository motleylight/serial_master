import { useState, useEffect, useCallback } from "react";
import { PortSharingService, SharingStatus } from "../services/ipc";
import { cn } from "../lib/utils";
import { Share2, Copy, Check, AlertTriangle } from "lucide-react";

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
    const [copied, setCopied] = useState(false);

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

    // Copy external port name (first one for now)
    const copyPortName = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (status.port_pairs.length > 0) {
            // Usually the external port is Port B of the pair
            const portName = status.port_pairs[0].port_b;
            navigator.clipboard.writeText(portName);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
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
            <button
                onClick={onClick}
                className={cn(
                    "h-7 px-3 rounded flex items-center gap-1.5 text-xs font-medium transition-colors border shadow-sm",
                    status.enabled
                        ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                        : "bg-white hover:bg-gray-50 text-gray-700 border-gray-300"
                )}
                title={status.enabled ? "Sharing Active - Click to Manage" : "Share Port"}
            >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                    {status.enabled ? "Sharing" : "Share Port"}
                </span>
            </button>

            {status.enabled && status.port_pairs.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 h-7 bg-purple-50 border border-purple-200 rounded text-xs">
                    <span className="text-purple-600 font-medium">
                        {status.port_pairs.map(p => p.port_b).join(', ')}
                    </span>
                    <button
                        onClick={copyPortName}
                        className="p-0.5 hover:bg-purple-100 rounded text-purple-500"
                        title="Copy Port Name"
                    >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                </div>
            )}
        </div>
    );
}
