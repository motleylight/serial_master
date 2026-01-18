import { useEffect, useRef, useCallback, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useScriptRunner } from '../hooks/useScriptRunner';
import { SerialService } from '../services/ipc';
import { Loader2, Square, HelpCircle, X, ChevronDown, ChevronRight } from 'lucide-react';
import { createRoot } from 'react-dom/client';

interface CommandEditorProps {
    content: string;
    setContent: (val: string) => void;
    onSend: (data: Uint8Array | number[]) => void;
    onLog?: (msg: string) => void;
    connected: boolean;
    wordWrap?: 'on' | 'off';
}

export function CommandEditor({ content, setContent, onSend, onLog, connected, wordWrap = 'off' }: CommandEditorProps) {

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const decorationsCollection = useRef<any>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [monacoInstance, setMonacoInstance] = useState<any>(null);
    const foldWidgetsRef = useRef<any[]>([]); // Store { widget, root }

    const { run: runScript, terminate: stopScript, feedData, status: scriptStatus } = useScriptRunner({
        onSend: (data) => {
            if (connected) onSend(data);
        },
        onLog: (msg) => {
            onLog?.(msg);
        },
        onError: (err) => {
            console.error("Script Error:", err);
            // Optionally show toast or alert
        }
    });

    // Listen to incoming data for 'recv'
    useEffect(() => {
        let unlisten: any = null;
        const setup = async () => {
            unlisten = await SerialService.listen((data) => {
                feedData(data);
            });
        };
        setup();
        return () => {
            if (unlisten) unlisten();
        };
    }, [feedData]);


    // --- Parsing Logic ---
    type ParseResult =
        | { type: 'noop'; data: null }
        | { type: 'error'; data: string }
        | { type: 'hex'; data: Uint8Array }
        | { type: 'text'; data: Uint8Array }
        | { type: 'script'; data: string };

    const parseCommandAtLine = (model: any, lineNumber: number): ParseResult => {
        const lineContent = model.getLineContent(lineNumber);
        const trimmed = lineContent.trim();

        if (!trimmed || trimmed.startsWith('#')) return { type: 'noop', data: null };

        // 1. Check if inside a code block
        let startLine = -1;
        let endLine = -1;

        // Scan backwards for start of block
        for (let i = lineNumber; i >= 1; i--) {
            const txt = model.getLineContent(i).trim();
            if (txt.startsWith('```')) {
                if (i === lineNumber) {
                    startLine = i;
                } else {
                    startLine = i;
                }
                break;
            }
        }

        if (startLine !== -1) {
            // Check if we are closed before current line
            let closed = false;
            for (let i = startLine + 1; i < lineNumber; i++) {
                if (model.getLineContent(i).trim().startsWith('```')) {
                    closed = true;
                    break;
                }
            }

            if (!closed) {
                // We are inside or on start. Scan for end.
                for (let i = Math.max(startLine + 1, lineNumber); i <= model.getLineCount(); i++) {
                    if (model.getLineContent(i).trim().startsWith('```')) {
                        endLine = i;
                        break;
                    }
                }

                if (endLine !== -1) {
                    // Extract Script
                    const range = model.getValueInRange({
                        startLineNumber: startLine + 1,
                        startColumn: 1,
                        endLineNumber: endLine - 1,
                        endColumn: model.getLineMaxColumn(endLine - 1)
                    });

                    // Check Language
                    const startLineContent = model.getLineContent(startLine).trim();
                    const lang = startLineContent.substring(3).trim().toLowerCase();
                    const isSupported = lang === '' || lang === 'js' || lang === 'javascript';

                    if (!isSupported) {
                        return { type: 'error', data: `Unsupported language: ${lang}. Please use 'js' or leave empty.` };
                    }

                    return { type: 'script', data: range };
                }
            }
        }

        // 2. Hex
        if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 1) {
            const hexStr = trimmed.substring(1, trimmed.length - 1).trim();
            const cleanHex = hexStr.replace(/[^0-9A-Fa-f]/g, '');
            if (cleanHex.length % 2 !== 0) return { type: 'error', data: 'Invalid Hex Length' };

            const bytes = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
                bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
            }
            return { type: 'hex', data: bytes };
        }

        // 3. Fallback: Text
        if (trimmed.startsWith('```')) return { type: 'noop', data: null };
        return { type: 'text', data: new TextEncoder().encode(trimmed) };
    };

    const getCommandsList = (fullContent: string): string[] => {
        const lines = fullContent.split('\n');
        const cmds: string[] = [];
        let currentScript: string[] = [];
        let inScriptBlock = false;

        const flushScript = () => {
            if (currentScript.length > 0) {
                cmds.push(currentScript.join('\n'));
                currentScript = [];
            }
        };

        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('```')) {
                if (inScriptBlock) {
                    inScriptBlock = false;
                    flushScript();
                } else {
                    inScriptBlock = true;
                }
                continue;
            }

            if (inScriptBlock) {
                currentScript.push(line);
                continue;
            }

            if (!trimmed || trimmed.startsWith('#')) continue;

            cmds.push(trimmed);
        }
        return cmds;
    };

    // --- Execution ---
    const executeLine = useCallback((lineNumber: number) => {
        // If script is running, maybe stop it? Or allow parallel?
        // Let's allow clicking "Run" on another line to just run that too (queueing in worker is hard, new worker per run is safer but heavier).
        // Our hook reuses the worker. Calling run() terminates previous.
        // So clicking Run executes NEW code.

        if (!editorRef.current) return;
        // if (!connected) return; // Allow running script logic even if disconnected? send() will fail/ignore.

        const model = editorRef.current.getModel();
        const result = parseCommandAtLine(model, lineNumber);

        if (result.type === 'hex') {
            onSend(result.data);
        } else if (result.type === 'text') {
            onSend(result.data);
        } else if (result.type === 'script') {
            const cmdList = getCommandsList(model.getValue());
            runScript(result.data, cmdList);
        } else if (result.type === 'error') {
            console.warn('Command Error:', result.data);
        }
    }, [editorRef, connected, onSend, runScript]);

    // --- Stale Closure Fix ---
    const executeLineRef = useRef(executeLine);
    useEffect(() => {
        executeLineRef.current = executeLine;
    }, [executeLine]);

    // --- Command Index Calculation (Line Numbers) ---
    const commandIndexMapRef = useRef<Record<number, string>>({});

    useEffect(() => {
        const lines = content.split('\n');
        const map: Record<number, string> = {};
        let cmdCounter = 0;
        let inBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('```')) {
                if (!inBlock) {
                    cmdCounter++;
                    map[i + 1] = cmdCounter.toString();
                    inBlock = true;
                } else {
                    map[i + 1] = '';
                    inBlock = false;
                }
                continue;
            }

            if (inBlock) {
                map[i + 1] = '';
                continue;
            }

            if (trimmed && !trimmed.startsWith('#')) {
                cmdCounter++;
                map[i + 1] = cmdCounter.toString();
            } else {
                map[i + 1] = '';
            }
        }

        commandIndexMapRef.current = map;

        if (editorRef.current) {
            editorRef.current.updateOptions({
                lineNumbers: (lineNumber: number) => {
                    return commandIndexMapRef.current[lineNumber] || '';
                }
            });
        }
    }, [content]);

    // --- Editor Mount & Interaction ---
    const updateDecorations = useCallback(() => {
        if (!editorRef.current || !monacoRef.current) return;

        const model = editorRef.current.getModel();
        if (!model) return;

        const lineCount = model.getLineCount();
        const newDecorations = [];

        let inBlock = false;

        for (let i = 1; i <= lineCount; i++) {
            const content = model.getLineContent(i);
            const trimmed = content.trim();

            if (trimmed.startsWith('```')) {
                if (!inBlock) {
                    inBlock = true;

                    // Validate Language
                    const lang = trimmed.substring(3).trim().toLowerCase();
                    const isSupported = lang === '' || lang === 'js' || lang === 'javascript';

                    if (isSupported) {
                        newDecorations.push({
                            range: new monacoRef.current.Range(i, 1, i, 1),
                            options: {
                                isWholeLine: false,
                                glyphMarginClassName: 'run-glyph-margin',
                                glyphMarginHoverMessage: { value: 'Run Script' }
                            }
                        });
                    } else {
                        newDecorations.push({
                            range: new monacoRef.current.Range(i, 1, i, 1),
                            options: {
                                isWholeLine: false,
                                glyphMarginClassName: 'unsupported-glyph-margin',
                                glyphMarginHoverMessage: { value: `Unsupported language: ${lang || '?'}. Only JS is supported.` }
                            }
                        });
                    }
                } else {
                    inBlock = false;
                }
                continue;
            }

            if (inBlock) continue;

            if (trimmed && !trimmed.startsWith('#')) {
                const isHex = trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 1;

                newDecorations.push({
                    range: new monacoRef.current.Range(i, 1, i, 1),
                    options: {
                        isWholeLine: false,
                        glyphMarginClassName: 'run-glyph-margin',
                        glyphMarginHoverMessage: { value: isHex ? 'Run Hex' : 'Send Line' }
                    }
                });

                if (isHex) {
                    newDecorations.push({
                        range: new monacoRef.current.Range(i, 1, i, model.getLineMaxColumn(i)),
                        options: {
                            afterContentClassName: 'hex-badge'
                        }
                    });
                }
            }
        }

        decorationsCollection.current?.set(newDecorations);
    }, []);

    const updateFoldWidgets = useCallback(() => {
        if (!editorRef.current || !monacoInstance) return;

        // Cleanup existing widgets
        foldWidgetsRef.current.forEach(({ widget, root }) => {
            editorRef.current.removeContentWidget(widget);
            setTimeout(() => root.unmount(), 0); // Unmount after removal to avoid React warnings
        });
        foldWidgetsRef.current = [];

        const model = editorRef.current.getModel();
        if (!model) return;

        const lineCount = model.getLineCount();
        const newWidgets: any[] = [];

        for (let i = 1; i <= lineCount; i++) {
            const lineContent = model.getLineContent(i).trim();
            // Allow folding for ANY code block, regardless of language
            // But checking for '```' matches both start and end!
            // We need to differentiate.
            // A simple heuristic: if it has chars after ```, it's a start.
            // If it's JUST ```, it could be start (plain) or end.
            // To be precise, we need to track toggle state like we do in decorations or parsing.

            // Re-using the logic from parse/decorations is best.
            // But here we can do a simple state machine:

            // Let's assume we are in block if we saw a start.
            // This loop needs to track `inBlock`.

            // Actually, we can reuse the parsing logic concept correctly.

        }
        let inBlock = false;

        for (let i = 1; i <= lineCount; i++) {
            const lineContent = model.getLineContent(i).trim();

            if (lineContent.startsWith('```')) {
                if (!inBlock) {
                    inBlock = true;
                    // This is a START block. Add widget.
                    // Continue to adding widget logic below
                } else {
                    inBlock = false;
                    // This is an END block. Skip widget.
                    continue;
                }
            } else {
                // Not a fence line, continue
                continue;
            }

            // --- Widget Creation ---
            const FoldWidget = () => {
                const [collapsed, setCollapsed] = useState(false);

                const handleClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    // Toggle local state
                    setCollapsed(prev => !prev);

                    // Trigger Monaco fold
                    editorRef.current.setPosition({ lineNumber: i, column: 1 });
                    editorRef.current.trigger('fold', 'editor.toggleFold', {});
                };

                return (
                    <div onClick={handleClick} title={collapsed ? "Unfold" : "Fold"} className="command-fold-widget">
                        {collapsed ? (
                            <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        )}
                    </div>
                );
            };

            const widgetNode = document.createElement('div');
            // Root needs to be created after element

            const widgetId = 'fold.widget.' + i;
            // Use a separate container for the react root to avoid re-creation issues or just standard way

            const root = createRoot(widgetNode);
            root.render(<FoldWidget />);

            const widget = {
                getId: () => widgetId,
                getDomNode: () => widgetNode,
                getPosition: () => ({
                    position: { lineNumber: i, column: model.getLineMaxColumn(i) + 1 },
                    preference: [monacoInstance.editor.ContentWidgetPositionPreference.EXACT]
                })
            };

            editorRef.current.addContentWidget(widget);
            newWidgets.push({ widget, root });
        }
        foldWidgetsRef.current = newWidgets;
    }, [monacoInstance, editorRef]);



    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setMonacoInstance(monaco);

        decorationsCollection.current = editor.createDecorationsCollection([]);

        editor.onMouseDown((e) => {
            if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position?.lineNumber;
                if (lineNumber) executeLineRef.current(lineNumber);
            }
            // Handle folding toggle on line numbers
            if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                const lineNumber = e.target.position?.lineNumber;
                if (lineNumber) {
                    const lineContent = editor.getModel()?.getLineContent(lineNumber).trim();
                    // Only toggle if it looks like a script start or we marked it
                    if (lineContent?.startsWith('```') && commandIndexMapRef.current[lineNumber] === '▼') {
                        editor.setPosition({ lineNumber, column: 1 });
                        editor.trigger('fold', 'editor.toggleFold', {});
                    }
                }
            }
        });

        updateDecorations();
    };

    // Register Folding Provider with Cleanup
    useEffect(() => {
        if (!monacoInstance) return;

        const disposable = monacoInstance.languages.registerFoldingRangeProvider('markdown', {
            provideFoldingRanges: (model: any, _context: any, _token: any) => {
                const ranges = [];
                const lineCount = model.getLineCount();
                let start = -1;

                for (let i = 1; i <= lineCount; i++) {
                    const line = model.getLineContent(i).trim();
                    if (line.startsWith('```')) {
                        if (start === -1) {
                            start = i;
                        } else {
                            // End of block
                            ranges.push({
                                start: start,
                                end: i,
                                kind: monacoInstance.languages.FoldingRangeKind.Region
                            });
                            start = -1;
                        }
                    }
                }
                return ranges;
            }
        });

        return () => {
            disposable.dispose();
        };
    }, [monacoInstance]);

    useEffect(() => {
        updateDecorations();
        updateFoldWidgets();
    }, [content, updateDecorations, updateFoldWidgets]);

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <div className="flex-1 min-h-0 relative">
                <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    value={content}
                    onChange={(val) => setContent(val || '')}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        glyphMargin: true,
                        lineNumbers: (lineNumber) => commandIndexMapRef.current[lineNumber] || '',
                        lineNumbersMinChars: 2,
                        folding: true,
                        showFoldingControls: 'never', // Changed from 'always' to 'never'
                        wordWrap: wordWrap,
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        padding: { top: 8, bottom: 8 },
                        renderLineHighlight: 'line',
                        contextmenu: false,
                    }}
                />

                {/* Help Overlay */}
                {showHelp && (
                    <div className="absolute inset-2 bg-background/95 backdrop-blur-sm border border-border shadow-lg rounded-md z-10 overflow-y-auto p-4 flex flex-col">
                        <div className="flex justify-between items-start mb-4 border-b pb-2">
                            <h2 className="text-lg font-bold">Commands & Scripting Guide</h2>
                            <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                            <div>
                                <h3 className="text-base font-semibold">Message Format</h3>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><strong># Name</strong>: Command Header</li>
                                    <li><strong>Hello</strong>: Plain Text Command</li>
                                    <li><strong>*AA BB*</strong>: Hex Command (wrapped in asterisks)</li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-base font-semibold">JavaScript API</h3>
                                <p className="text-xs text-muted-foreground mb-2">Use <code>```js</code> blocks. No imports needed.</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><code>send(data)</code>: Send string, bytes <code>[0xAA]</code>, or Hex String <code>"*AA BB*"</code></li>
                                    <li><code>recv(timeout)</code>: Wait for data and return <strong>String</strong> (or null)</li>
                                    <li><code>recv_hex(timeout)</code>: Wait for data and return <strong>Uint8Array</strong> (or null)</li>
                                    <li><code>delay(ms)</code>: Pause execution (e.g. <code>delay(1000)</code>)</li>
                                    <li><code>log(msg)</code>: Print to system log</li>
                                    <li><code>cmd[i]</code>: Access other commands (Array of strings)</li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-base font-semibold">Script Examples</h3>

                                <div className="space-y-4">
                                    {/* Example 1 */}
                                    <div>
                                        <div className="font-medium text-xs mb-1">1. Loop with Delay</div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                                            {`\`\`\`js
log("Starting Loop...");
for(let i = 1; i <= 5; i++) {
    log("Count: " + i);
    send([0xAA, i]); 
    delay(500); // 500ms delay
}
\`\`\``}
                                        </pre>
                                    </div>

                                    {/* Example 2 */}
                                    <div>
                                        <div className="font-medium text-xs mb-1">2. Simple Send & Receive</div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                                            {`\`\`\`js
log("Sending Query...");
send("AT+VERSION\\r\\n");

const resp = recv(2000); // Wait up to 2s
if (resp) {
    const text = new TextDecoder().decode(resp);
    log("Reply: " + text);
} else {
    log("Timeout!");
}
\`\`\``}
                                        </pre>
                                    </div>

                                    {/* Example 3 */}
                                    <div>
                                        <div className="font-medium text-xs mb-1">3. Handshake (Wait for Data then Reply)</div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                                            {`\`\`\`js
log("Waiting for Hex AA 55...");
const packet = recv(5000); // Wait 5s

if (packet && packet.length >= 2 && packet[0] === 0xAA && packet[1] === 0x55) {
    log("Valid Handshake! Sending ACK.");
    send("OK");
} else {
    log("Invalid or No Data");
}
\`\`\``}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="px-2 py-1 bg-muted/30 border-t border-border text-[10px] text-muted-foreground flex justify-between items-center h-[26px]">
                {scriptStatus === 'running' ? (
                    <div className="flex items-center gap-2 text-primary font-medium">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Running Script...</span>
                        <button onClick={stopScript} className="ml-2 hover:text-red-500 flex items-center gap-1">
                            <Square className="w-3 h-3 fill-current" />
                            Stop
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <span># Header &nbsp; *Hex* &nbsp; ```js Script</span>
                    </div>
                )}
                <button
                    onClick={() => setShowHelp(!showHelp)}
                    className={`flex items-center gap-1 hover:text-foreground ${showHelp ? 'text-primary font-medium' : ''}`}
                    title="Toggle Help"
                >
                    <HelpCircle className="w-3 h-3" />
                    <span>Help</span>
                </button>
            </div>
        </div >
    );
}
