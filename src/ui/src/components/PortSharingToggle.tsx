import { useState, useEffect, useCallback } from "react";
import { PortSharingService, SharingStatus } from "../services/ipc";
import { cn } from "../lib/utils";
import { Share2, Copy, Check, AlertTriangle, ExternalLink } from "lucide-react";

interface PortSharingToggleProps {
    /** 当前连接的物理端口 */
    physicalPort: string;
    /** 是否已连接到串口 */
    isConnected: boolean;
}

export function PortSharingToggle({ physicalPort, isConnected }: PortSharingToggleProps) {
    const [status, setStatus] = useState<SharingStatus>({
        enabled: false,
        port_pair: null,
        external_port: null
    });
    const [isLoading, setIsLoading] = useState(false);
    const [com0comInstalled, setCom0comInstalled] = useState<boolean | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 检测 com0com 安装状态
    useEffect(() => {
        PortSharingService.isCom0comInstalled().then(setCom0comInstalled);
    }, []);

    // 获取共享状态
    const refreshStatus = useCallback(async () => {
        try {
            const s = await PortSharingService.getSharingStatus();
            setStatus(s);
            setError(null);
        } catch (e) {
            console.error("获取共享状态失败:", e);
        }
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    // 切换共享模式
    const toggleSharing = async () => {
        if (!com0comInstalled) return;

        setIsLoading(true);
        setError(null);

        try {
            if (status.enabled) {
                await PortSharingService.disableSharing();
            } else {
                await PortSharingService.enableSharing(physicalPort);
            }
            await refreshStatus();
        } catch (e: any) {
            setError(e?.toString() || "操作失败");
        } finally {
            setIsLoading(false);
        }
    };

    // 复制端口名
    const copyPortName = () => {
        if (status.external_port) {
            navigator.clipboard.writeText(status.external_port);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // 显示安装引导
    if (com0comInstalled === false) {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>端口共享需要</span>
                <a
                    href="https://sourceforge.net/projects/com0com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-700 inline-flex items-center gap-0.5"
                >
                    安装 com0com
                    <ExternalLink className="w-2.5 h-2.5" />
                </a>
            </div>
        );
    }

    // 加载中
    if (com0comInstalled === null) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            {/* 共享开关按钮 */}
            <button
                onClick={toggleSharing}
                disabled={isLoading || !isConnected}
                className={cn(
                    "h-7 px-2 rounded flex items-center gap-1.5 text-xs font-medium transition-colors border",
                    status.enabled
                        ? "bg-purple-500 hover:bg-purple-600 text-white border-purple-600"
                        : "bg-background hover:bg-accent text-foreground border-input",
                    (isLoading || !isConnected) && "opacity-50 cursor-not-allowed"
                )}
                title={status.enabled ? "禁用端口共享" : "启用端口共享 (允许其他软件同时访问此端口)"}
            >
                <Share2 className={cn("w-3.5 h-3.5", isLoading && "animate-pulse")} />
                <span className="hidden sm:inline">
                    {status.enabled ? "共享中" : "共享"}
                </span>
            </button>

            {/* 虚拟端口信息 */}
            {status.enabled && status.external_port && (
                <div className="flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-950/30 rounded border border-purple-200 dark:border-purple-800">
                    <span className="text-[10px] text-purple-600 dark:text-purple-400">
                        其他软件连接:
                    </span>
                    <code className="font-mono text-xs font-bold text-purple-700 dark:text-purple-300">
                        {status.external_port}
                    </code>
                    <button
                        onClick={copyPortName}
                        className="ml-1 p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800 rounded transition-colors"
                        title="复制端口名"
                    >
                        {copied ? (
                            <Check className="w-3 h-3 text-green-600" />
                        ) : (
                            <Copy className="w-3 h-3 text-purple-500" />
                        )}
                    </button>
                </div>
            )}

            {/* 错误提示 */}
            {error && (
                <span className="text-[10px] text-red-500">{error}</span>
            )}
        </div>
    );
}
