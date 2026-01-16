import React, { useState, useEffect } from 'react';
import { PortSharingService, PortPair, SharingStatus } from '../services/ipc';
import { SerialPortInfo, SerialService } from '../services/ipc';
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
    const [physicalPorts, setPhysicalPorts] = useState<SerialPortInfo[]>([]);
    const [selectedPhysicalPort, setSelectedPhysicalPort] = useState<string>(currentPhysicalPort || '');

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
            loadData();
        }
    }, [isOpen]);

    const checkDependencies = async () => {
        const c0c = await PortSharingService.isCom0comInstalled();
        const h4c = await PortSharingService.isHub4comInstalled();
        setCom0comInstalled(c0c);
        setHub4comInstalled(h4c);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, p, phy] = await Promise.all([
                PortSharingService.getSharingStatus(),
                PortSharingService.getVirtualPairs(),
                SerialService.getPorts() // Needed for source selection
            ]);
            setStatus(s);
            setPairs(p);
            setPhysicalPorts(phy);

            if (s.enabled && s.physical_port) {
                setSelectedPhysicalPort(s.physical_port);
                setSelectedPairIds(s.port_pairs.map(pair => pair.pair_id));
            } else {
                // Auto-create if empty (Only when not sharing and no pairs exist)
                if (p.length === 0 && com0comInstalled) {
                    // We need to be careful not to infinite loop or create too many. 
                    // Only create if we are sure we just loaded and it's empty.
                    // But loadData is called multiple times. 
                    // Let's do this via a separate effect or check a flag? 
                    // For now, let's just do it here but maybe guarded?
                    // Actually, `handleCreatePair` calls `loadData`, so let's avoiding calling it recursively.
                    // We can rely on user clicking "New" or just One-time auto create.
                    // User request: "默认创建一个...". 
                    // Let's defer this to a useEffect that runs once when pairs are loaded.
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
        if (com0comInstalled && !loading && pairs.length === 0 && !status?.enabled) {
            // Use a timeout to avoid react limits or race conditions
            const timer = setTimeout(() => {
                if (pairs.length === 0) { // Double check
                    handleCreatePair();
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [com0comInstalled, pairs.length, status?.enabled]); // Be careful with deps

    const handleStartSharing = async () => {
        setLoading(true);
        setError(null);
        try {
            const baud = currentBaudRate || 115200;
            await PortSharingService.startSharing(selectedPhysicalPort, selectedPairIds, baud);
            await loadData();
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
            await loadData();
            if (onShareStop) onShareStop();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePair = async () => {
        // Default names usually handled by backend if passed "-"
        // But here we might want to specify or let backend handle
        setLoading(true);
        try {
            // Using "-" to let setupc decide default names (e.g. CNCA0, CNCB0... or reusing)
            // Or usually users just want "COM11" etc.
            // Let's create with default first for simplicity as backend supports it
            await PortSharingService.createVirtualPair("-", "-");
            await loadData();
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
            // If the deleted pair was selected, remove it
            setSelectedPairIds(prev => prev.filter(pid => pid !== id));
            await loadData();
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
            await loadData();
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="port-sharing-overlay">
            <div className="port-sharing-dialog">
                <div className="dialog-header">
                    <h3>端口共享管理 (Port Sharing)</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="dialog-tabs">
                    <button
                        className={activeTab === 'share' ? 'active' : ''}
                        onClick={() => setActiveTab('share')}
                    >
                        共享配置 (Configuration)
                    </button>
                    <button
                        className={activeTab === 'manage' ? 'active' : ''}
                        onClick={() => setActiveTab('manage')}
                    >
                        高级管理 (Advanced)
                    </button>
                </div>

                <div className="dialog-content">
                    {loading && (
                        <div className="loading-overlay">
                            <div className="spinner"></div>
                            <div className="loading-text">Processing...</div>
                        </div>
                    )}

                    {error && <div className="error-barrier">{error}</div>}

                    {!com0comInstalled && (
                        <div className="warning-banner">
                            检测到未安装 com0com，虚拟串口功能不可用。<br />
                            com0com is not installed, virtual port features unavailable.
                        </div>
                    )}

                    {!hub4comInstalled && (
                        <div className="warning-banner">
                            检测到未安装 hub4com，端口共享功能不可用。<br />
                            hub4com is not installed, port sharing unavailable.
                        </div>
                    )}

                    {activeTab === 'share' && (
                        <div className="share-panel">
                            <div className="form-group">
                                <label>源串口 (Source Serial Port)</label>
                                <select
                                    value={selectedPhysicalPort}
                                    onChange={e => setSelectedPhysicalPort(e.target.value)}
                                    disabled={status?.enabled}
                                >
                                    <option value="">-- 请选择物理串口 --</option>
                                    {physicalPorts.map(p => (
                                        <option key={p.port_name} value={p.port_name}>
                                            {p.port_name} {p.product_name ? `(${p.product_name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <div className="label-row">
                                    <label>克隆端口 (Clone Ports)</label>
                                    <button
                                        className="btn-text-action"
                                        onClick={handleCreatePair}
                                        disabled={status?.enabled || loading}
                                        title="新建一个克隆端口"
                                    >
                                        + 新建克隆 (New Clone)
                                    </button>
                                </div>
                                <div className="description-text">
                                    这些端口完全等同于源串口，其他软件连接这些端口即可实现数据收发。<br />
                                    Connect your other applications to these ports.
                                </div>

                                <div className="pair-selector-list">
                                    {pairs.length === 0 && <div className="empty-hint">暂无克隆端口...</div>}
                                    {pairs.map(pair => (
                                        <div key={pair.pair_id} className="pair-checkbox-item">
                                            <input
                                                type="checkbox"
                                                checked={selectedPairIds.includes(pair.pair_id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedPairIds([...selectedPairIds, pair.pair_id]);
                                                    } else {
                                                        setSelectedPairIds(selectedPairIds.filter(id => id !== pair.pair_id));
                                                    }
                                                }}
                                                disabled={status?.enabled}
                                            />
                                            <div className="pair-info">
                                                <span className="main-port">
                                                    <strong>{pair.port_a}</strong>
                                                </span>
                                                <span className="sub-info">
                                                    ID: {pair.pair_id}
                                                </span>
                                            </div>

                                            {!status?.enabled && (
                                                <button
                                                    className="btn-icon-danger ml-auto"
                                                    onClick={() => handleRemovePair(pair.pair_id)}
                                                    title="删除此克隆端口"
                                                >
                                                    删除
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="actions">
                                {!status?.enabled ? (
                                    <button
                                        className="btn-primary"
                                        onClick={handleStartSharing}
                                        disabled={!selectedPhysicalPort || selectedPairIds.length === 0 || !hub4comInstalled}
                                    >
                                        开始共享 (Start Sharing)
                                    </button>
                                ) : (
                                    <button className="btn-danger" onClick={handleStopSharing}>
                                        停止共享 (Stop Sharing)
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'manage' && (
                        <div className="manage-panel">
                            <div className="topology-preview">
                                <div className="topology-diagram">
                                    <div className="node physical">{selectedPhysicalPort || "Source"}</div>
                                    <div className="link">Hub</div>
                                    <div className="node-group">
                                        {selectedPairIds.map(id => {
                                            const p = pairs.find(x => x.pair_id === id);
                                            if (!p) return null;
                                            return (
                                                <div key={id} className="virtual-branch">
                                                    <div className="node virtual-hub">{p.port_b}</div>
                                                    <div className="link-small">↔</div>
                                                    <div className="node virtual-app">{p.port_a}</div>
                                                </div>
                                            )
                                        })}
                                        {selectedPairIds.length === 0 && <span className="text-sm text-gray-500">No clones active</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="toolbar">
                                <h3>虚拟端口详细管理</h3>
                            </div>

                            <table className="virtual-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>App Port (A)</th>
                                        <th>Internal Port (B)</th>
                                        <th>操作 (Actions)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pairs.map(pair => (
                                        <tr key={pair.pair_id}>
                                            <td>{pair.pair_id}</td>
                                            <td>
                                                {editingPair?.pair_id === pair.pair_id ? (
                                                    <input
                                                        defaultValue={pair.port_a}
                                                        id={`edit-a-${pair.pair_id}`}
                                                    />
                                                ) : pair.port_a}
                                            </td>
                                            <td>
                                                {editingPair?.pair_id === pair.pair_id ? (
                                                    <input
                                                        defaultValue={pair.port_b}
                                                        id={`edit-b-${pair.pair_id}`}
                                                    />
                                                ) : pair.port_b}
                                            </td>
                                            <td>
                                                {editingPair?.pair_id === pair.pair_id ? (
                                                    <>
                                                        <button className="btn-secondary" style={{ marginRight: 5, padding: '4px 8px' }} onClick={() => {
                                                            const elA = document.getElementById(`edit-a-${pair.pair_id}`) as HTMLInputElement;
                                                            const elB = document.getElementById(`edit-b-${pair.pair_id}`) as HTMLInputElement;
                                                            handleRename(pair.pair_id, elA.value, elB.value);
                                                        }}>Save</button>
                                                        <button className="btn-text-action" onClick={() => setEditingPair(null)}>Cancel</button>
                                                    </>
                                                ) : (
                                                    <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditingPair(pair)}>
                                                        Rename
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
