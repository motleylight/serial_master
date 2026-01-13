import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { X, Save, FolderOpen, Play } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const TEMPLATES = [
    {
        name: 'Tx: Append Newline',
        type: 'pre_send',
        code: `# Append newline (0x0A)
data.append(0x0A)`
    },
    {
        name: 'Tx: Add Header/Footer',
        type: 'pre_send',
        code: `# Add Header [0xAA] and Footer [0xFF]
data.insert(0, 0xAA)
data.append(0xFF)`
    },
    {
        name: 'Tx: Modbus CRC16',
        type: 'pre_send',
        code: `# Modbus CRC16
crc = 0xFFFF
for byte in data:
    crc ^= byte
    for _ in range(8):
        if crc & 1:
            crc = (crc >> 1) ^ 0xA001
        else:
            crc >>= 1
data.append(crc & 0xFF)
data.append((crc >> 8) & 0xFF)`
    },
    {
        name: 'Rx: Filter 0xFF',
        type: 'rx',
        code: `# Drop packet if it contains 0xFF
if 0xFF in data:
    data = []`
    },
    {
        name: 'Rx: Only Printable',
        type: 'rx',
        code: `# Keep only printable ASCII (32-126) or newline
data = [b for b in data if (32 <= b <= 126) or b == 10 or b == 13]`
    }
];

interface ScriptEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ScriptEditor({ isOpen, onClose }: ScriptEditorProps) {
    const [activeTab, setActiveTab] = useState<'pre_send' | 'rx'>('pre_send');
    const [preScript, setPreScript] = useState('');
    const [rxScript, setRxScript] = useState('');

    const handleApply = async () => {
        try {
            await invoke('set_script', { scriptType: 'pre_send', content: preScript });
            await invoke('set_script', { scriptType: 'rx', content: rxScript });
            console.log('Scripts applied');
        } catch (e) {
            console.error('Failed to apply scripts', e);
        }
    };

    const handleOpenFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Python Script', extensions: ['py'] }]
            });
            if (selected && typeof selected === 'string') {
                const content = await readTextFile(selected);
                if (activeTab === 'pre_send') setPreScript(content);
                else setRxScript(content);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveFile = async () => {
        try {
            const filePath = await save({
                filters: [{ name: 'Python Script', extensions: ['py'] }]
            });
            if (filePath) {
                const content = activeTab === 'pre_send' ? preScript : rxScript;
                await writeTextFile(filePath, content);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const applyTemplate = (code: string) => {
        if (activeTab === 'pre_send') setPreScript(code);
        else setRxScript(code);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[900px] h-[600px] flex flex-col rounded-lg shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-semibold text-gray-700 ml-2">Scripting Engine (Python)</h2>
                        <div className="h-6 w-[1px] bg-gray-300"></div>
                        <div className="flex bg-gray-200 rounded-md p-0.5">
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'pre_send' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                                onClick={() => setActiveTab('pre_send')}
                            >
                                Tx Hook
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'rx' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                                onClick={() => setActiveTab('rx')}
                            >
                                Rx Hook
                            </button>
                        </div>
                        <div className="h-6 w-[1px] bg-gray-300 mx-2"></div>
                        <select
                            className="text-xs border border-gray-300 rounded px-2 py-1 outline-none text-gray-700 bg-white hover:border-gray-400"
                            onChange={(e) => {
                                if (e.target.value) {
                                    applyTemplate(e.target.value);
                                    e.target.value = ""; // Reset
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="" disabled>Load Template...</option>
                            {TEMPLATES.filter(t => t.type === activeTab).map((t, i) => (
                                <option key={i} value={t.code}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleOpenFile} className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900 transition-colors" title="Open File">
                            <FolderOpen className="w-4 h-4" />
                        </button>
                        <button onClick={handleSaveFile} className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900 transition-colors" title="Save to File">
                            <Save className="w-4 h-4" />
                        </button>
                        <div className="h-6 w-[1px] bg-gray-300 mx-1"></div>
                        <button onClick={handleApply} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors" title="Apply to Engine">
                            <Play className="w-3.5 h-3.5 fill-current" /> Apply
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 relative">
                    <Editor
                        height="100%"
                        defaultLanguage="python"
                        value={activeTab === 'pre_send' ? preScript : rxScript}
                        onChange={(val) => {
                            if (!val) val = '';
                            if (activeTab === 'pre_send') setPreScript(val);
                            else setRxScript(val);
                        }}
                        options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                        }}
                    />
                </div>
                <div className="p-3 text-xs text-gray-600 border-t bg-gray-50 flex flex-col gap-1">
                    {activeTab === 'pre_send' && (
                        <>
                            <div className="font-semibold text-gray-800">Tx Hook (Pre-send) Context:</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Variable <code>data</code> (list of int) contains the bytes to be sent.</li>
                                <li>Modify <code>data</code> in place or assign a new list to it to change what is sent.</li>
                                <li>Example: <code>data.append(0x0A)</code> or <code>data = [0xFF] + data</code></li>
                            </ul>
                        </>
                    )}
                    {activeTab === 'rx' && (
                        <>
                            <div className="font-semibold text-gray-800">Rx Hook (Pre-display) Context:</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Variable <code>data</code> (list of int) contains bytes received from port.</li>
                                <li>Modify <code>data</code> to filter or transform what the UI sees.</li>
                                <li>Set <code>data = []</code> to filter out (drop) the packet.</li>
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
