import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { X, Save } from 'lucide-react';

interface ScriptEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ScriptEditor({ isOpen, onClose }: ScriptEditorProps) {
    const [activeTab, setActiveTab] = useState<'pre_send' | 'post_send'>('pre_send');
    const [preScript, setPreScript] = useState('');
    const [postScript, setPostScript] = useState('');

    const handleSave = async () => {
        try {
            await invoke('set_script', { scriptType: 'pre_send', content: preScript });
            await invoke('set_script', { scriptType: 'post_send', content: postScript });
            // Could add toast or visual feedback
            console.log('Scripts saved');
        } catch (e) {
            console.error('Failed to save scripts', e);
        }
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
                                Pre-send Hook
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${activeTab === 'post_send' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                                onClick={() => setActiveTab('post_send')}
                            >
                                Post-send Hook
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors" title="Save Scripts">
                            <Save className="w-3.5 h-3.5" /> Save
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
                        value={activeTab === 'pre_send' ? preScript : postScript}
                        onChange={(val) => activeTab === 'pre_send' ? setPreScript(val || '') : setPostScript(val || '')}
                        options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                        }}
                    />
                </div>
                <div className="p-3 text-xs text-gray-600 border-t bg-gray-50 flex flex-col gap-1">
                    {activeTab === 'pre_send' ? (
                        <>
                            <div className="font-semibold text-gray-800">Pre-send Hook Context:</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Variable <code>data</code> (list of int) contains the bytes to be sent.</li>
                                <li>Modify <code>data</code> in place or assign a new list to it to change what is sent.</li>
                                <li>Example: <code>data.append(0x0A)</code> or <code>data = [0xFF] + data</code></li>
                            </ul>
                        </>
                    ) : (
                        <>
                            <div className="font-semibold text-gray-800">Post-send Hook Context:</div>
                            <div>Not yet implemented in Phase 2 MVP.</div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
