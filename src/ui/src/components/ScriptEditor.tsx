import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

import { X, Save, FolderOpen, Play } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { ScriptService } from '../services/ScriptService';

const JS_TEMPLATES = [
    {
        name: 'Tx: Append Newline',
        type: 'pre_send',
        code: `// Append newline (0x0A)
data.push(0x0A);`
    },
    {
        name: 'Tx: Add Header/Footer',
        type: 'pre_send',
        code: `// Add Header [0xAA] and Footer [0xFF]
data.unshift(0xAA);
data.push(0xFF);`
    },
    {
        name: 'Tx: Modbus CRC16 (Example)',
        type: 'pre_send',
        code: `// Simple CRC16 (Modbus)
let crc = 0xFFFF;
for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
        if (crc & 1) crc = (crc >> 1) ^ 0xA001;
        else crc >>= 1;
    }
}
data.push(crc & 0xFF);
data.push((crc >> 8) & 0xFF);`
    },
    {
        name: 'Rx: Filter 0xFF',
        type: 'rx',
        code: `// Drop packet if it contains 0xFF
if (data.includes(0xFF)) {
    data.length = 0; // Clear array to drop
}`
    },
    {
        name: 'Rx: Only Printable',
        type: 'rx',
        code: `// Keep only printable ASCII (32-126) or newline
const filtered = data.filter(b => (b >= 32 && b <= 126) || b === 10 || b === 13);
// Replace content of data
data.length = 0;
data.push(...filtered);`
    }
];

const EXT_TEMPLATES = [
    {
        name: 'Python Script',
        code: 'python script.py'
    },
    {
        name: 'Node Script',
        code: 'node script.js'
    },
    {
        name: 'Executable',
        code: './path/to/executable.exe'
    }
];

interface ScriptEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ScriptEditor({ isOpen, onClose }: ScriptEditorProps) {
    const [mode, setMode] = useState<'js' | 'external'>('external');
    const [activeTab, setActiveTab] = useState<'pre_send' | 'rx'>('rx');

    // JS Scripts
    const [jsPre, setJsPre] = useState('');
    const [jsRx, setJsRx] = useState('');

    // External Commands
    const [extPre, setExtPre] = useState('');
    const [extRx, setExtRx] = useState('');

    // Initial Load Logic
    useEffect(() => {
        if (isOpen) {
            const tx = ScriptService.txState;
            const rx = ScriptService.rxState;

            // 1. Load DRAFTS from Service (Config)
            setJsPre(tx.js || '');
            setJsRx(rx.js || '');
            setExtPre(tx.external || '');
            setExtRx(rx.external || '');

            // 2. Set Mode based on ACTIVE type
            if (tx.type === 'js' || rx.type === 'js') {
                setMode('js');
            } else if (tx.type === 'external' || rx.type === 'external') {
                setMode('external');
            }
        }
    }, [isOpen]);


    // Track running state for CURRENT ACTIVE TAB
    const [isRunning, setIsRunning] = useState(false);
    useEffect(() => {
        const checkRunning = () => {
            const tx = ScriptService.txState;
            const rx = ScriptService.rxState;
            // Now logic depends on activeTab
            if (mode === 'js') {
                if (activeTab === 'pre_send') setIsRunning(tx.type === 'js');
                else setIsRunning(rx.type === 'js');
            } else {
                if (activeTab === 'pre_send') setIsRunning(tx.type === 'external');
                else setIsRunning(rx.type === 'external');
            }
        };
        checkRunning();
        ScriptService.addEventListener('change', checkRunning);
        return () => ScriptService.removeEventListener('change', checkRunning);
    }, [mode, activeTab]);

    const handleToggleRun = async () => {
        try {
            if (isRunning) {
                // STOP only the active tab's script type
                if (activeTab === 'pre_send') {
                    // Start or Stop Tx
                    // If running, we stop it (set to null)
                    await ScriptService.setTxScript(null, '');
                } else {
                    // Stop Rx
                    await ScriptService.setRxScript(null, '');
                }
            } else {
                // START active tab
                const content = mode === 'js'
                    ? (activeTab === 'pre_send' ? jsPre : jsRx)
                    : (activeTab === 'pre_send' ? extPre : extRx);

                if (activeTab === 'pre_send') {
                    // Start Tx
                    await ScriptService.setTxScript(mode, content);
                } else {
                    // Start Rx
                    await ScriptService.setRxScript(mode, content);
                }
                // Do NOT close window implicitly per user request
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenFile = async () => {
        try {
            const ext = mode === 'js' ? ['js'] : [];
            const selected = await open({
                multiple: false,
                filters: ext.length ? [{ name: 'Script', extensions: ext }] : undefined
            });
            if (selected && typeof selected === 'string') {
                const content = await readTextFile(selected);
                if (mode === 'js') {
                    if (activeTab === 'pre_send') {
                        setJsPre(content);
                        ScriptService.updateTx({ js: content });
                    } else {
                        setJsRx(content);
                        ScriptService.updateRx({ js: content });
                    }
                } else {
                    if (activeTab === 'pre_send') {
                        setExtPre(content);
                        ScriptService.updateTx({ external: content });
                    } else {
                        setExtRx(content);
                        ScriptService.updateRx({ external: content });
                    }
                }
            }
        } catch (err) {
            console.error(err);
        }
    };



    const handleSaveFile = async () => {
        try {
            const ext = mode === 'js' ? ['js'] : ['txt'];
            const filePath = await save({
                filters: [{ name: 'Script', extensions: ext }]
            });
            if (filePath) {
                const content = mode === 'js'
                    ? (activeTab === 'pre_send' ? jsPre : jsRx)
                    : (activeTab === 'pre_send' ? extPre : extRx);
                await writeTextFile(filePath, content);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const applyTemplate = (code: string) => {
        if (mode === 'js') {
            if (activeTab === 'pre_send') {
                setJsPre(code);
                ScriptService.updateTx({ js: code });
            } else {
                setJsRx(code);
                ScriptService.updateRx({ js: code });
            }
        } else {
            if (activeTab === 'pre_send') {
                setExtPre(code);
                ScriptService.updateTx({ external: code });
            } else {
                setExtRx(code);
                ScriptService.updateRx({ external: code });
            }
        }
    };

    const currentCode = mode === 'js'
        ? (activeTab === 'pre_send' ? jsPre : jsRx)
        : (activeTab === 'pre_send' ? extPre : extRx);

    const updateCode = (val: string) => {
        if (mode === 'js') {
            if (activeTab === 'pre_send') {
                setJsPre(val);
                ScriptService.updateTx({ js: val });
            } else {
                setJsRx(val);
                ScriptService.updateRx({ js: val });
            }
        } else {
            if (activeTab === 'pre_send') {
                setExtPre(val);
                ScriptService.updateTx({ external: val });
            } else {
                setExtRx(val);
                ScriptService.updateRx({ external: val });
            }
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[900px] h-[600px] flex flex-col rounded-lg shadow-2xl overflow-hidden border border-gray-200">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-gray-200 rounded-md p-0.5">
                            <button
                                className={`px-3 py-1 text-xs font-bold rounded-sm transition-all ${mode === 'external' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                onClick={() => setMode('external')}
                            >
                                External Command
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-bold rounded-sm transition-all ${mode === 'js' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                onClick={() => setMode('js')}
                            >
                                JavaScript
                            </button>
                        </div>

                        <div className="h-6 w-[1px] bg-gray-300"></div>

                        <div className="flex bg-gray-200 rounded-md p-0.5">
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'rx' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                                onClick={() => setActiveTab('rx')}
                            >
                                Rx Hook
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'pre_send' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                                onClick={() => setActiveTab('pre_send')}
                            >
                                Tx Hook
                            </button>
                        </div>

                        <div className="h-6 w-[1px] bg-gray-300 mx-1"></div>

                        <select
                            className="text-xs border border-gray-300 rounded px-2 py-1 outline-none text-gray-700 bg-white hover:border-gray-400 max-w-[150px]"
                            onChange={(e) => {
                                if (e.target.value) {
                                    applyTemplate(e.target.value);
                                    e.target.value = "";
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="" disabled>Templates...</option>
                            {((mode === 'js' ? JS_TEMPLATES.filter(t => t.type === activeTab) : EXT_TEMPLATES) as any[]).map((t, i) => (
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
                        <button onClick={handleToggleRun} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${isRunning ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`} title={isRunning ? "Stop Scripts" : "Apply Changes"}>
                            {isRunning ? (
                                <><X className="w-3.5 h-3.5" /> Stop</>
                            ) : (
                                <><Play className="w-3.5 h-3.5 fill-current" /> Apply</>
                            )}
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Editor / Input Area */}
                <div className="flex-1 relative bg-white">
                    {mode === 'js' ? (
                        <Editor
                            height="100%"
                            defaultLanguage="javascript"
                            language="javascript"
                            theme="light"
                            value={currentCode}
                            onChange={(val) => updateCode(val || '')}
                            options={{
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 13,
                                fontFamily: 'Menlo, Monaco, "Courier New", monospace'
                            }}
                        />
                    ) : (
                        <div className="p-6">
                            <div className="text-gray-700 text-sm mb-2 font-semibold">Command Line to Execute:</div>
                            <input
                                className="w-full bg-white border border-gray-300 rounded p-3 text-gray-900 font-mono text-sm focus:border-blue-500 focus:outline-none placeholder-gray-400 shadow-sm"
                                placeholder="e.g. python processor.py --arg"
                                value={currentCode}
                                onChange={e => updateCode(e.target.value)}
                            />
                            <div className="mt-4 text-xs text-gray-500 space-y-2">
                                <p>Provide the full command line to run. The process will be spawned for each data packet if it terminates, or reused (implementation dependent).</p>
                                <p><strong>Data Flow:</strong> Serial Data &rarr; Stdin &rarr; External Process &rarr; Stdout &rarr; (Serial/UI)</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Context Info */}
                <div className="p-3 text-xs text-gray-600 border-t bg-gray-50 flex flex-col gap-1">
                    {mode === 'js' && activeTab === 'pre_send' && (
                        <div>Variable <code>data</code> (Array of numbers) contains bytes to send. Modify it in place or return new array.</div>
                    )}
                    {mode === 'js' && activeTab === 'rx' && (
                        <div>Variable <code>data</code> (Array of numbers) contains received bytes. Modify it to filter/transform display.</div>
                    )}
                    {mode === 'external' && (
                        <div>The updated data should be written to <strong>Stdout</strong>. Binary safe.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
