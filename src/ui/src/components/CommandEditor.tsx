import { useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

interface CommandEditorProps {
    content: string;
    setContent: (val: string) => void;
    onSend: (data: Uint8Array | number[]) => void;
    connected: boolean;
    wordWrap?: 'on' | 'off';
}

export function CommandEditor({ content, setContent, onSend, connected, wordWrap = 'off' }: CommandEditorProps) {

    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const decorationsCollection = useRef<any>(null);
    const commandIndexMapRef = useRef<Record<number, string>>({});

    // --- Parsing Logic ---
    type ParseResult =
        | { type: 'noop'; data: null }
        | { type: 'error'; data: string }
        | { type: 'hex'; data: Uint8Array }
        | { type: 'text'; data: Uint8Array };

    const parseLine = (text: string): ParseResult => {
        const trimmed = text.trim();
        if (!trimmed || trimmed.startsWith('#')) return { type: 'noop', data: null };

        if (trimmed.toLowerCase().startsWith('hex:')) {
            const hexStr = trimmed.substring(4).trim();
            const cleanHex = hexStr.replace(/[^0-9A-Fa-f]/g, '');
            if (cleanHex.length % 2 !== 0) return { type: 'error', data: 'Invalid Hex Length' };

            const bytes = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
                bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
            }
            return { type: 'hex', data: bytes };
        }

        return { type: 'text', data: new TextEncoder().encode(text) };
    };

    // --- Execution ---
    const executeLine = useCallback((lineNumber: number) => {
        if (!editorRef.current) return;
        if (!connected) return;

        const model = editorRef.current.getModel();
        const lineContent = model.getLineContent(lineNumber);

        const result = parseLine(lineContent);

        if (result.type === 'hex') {
            onSend(result.data);
        } else if (result.type === 'text') {
            onSend(result.data);
        } else if (result.type === 'error') {
            console.warn('Command Error:', result.data);
        }
    }, [editorRef, connected, onSend]);

    // --- Stale Closure Fix ---
    const executeLineRef = useRef(executeLine);
    useEffect(() => {
        executeLineRef.current = executeLine;
    }, [executeLine]);

    // --- Command Index Calculation (Line Numbers) ---
    useEffect(() => {
        const lines = content.split('\n');
        const map: Record<number, string> = {};
        let cmdCounter = 0;

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Valid command logic: Not empty, not comment
            if (trimmed && !trimmed.startsWith('#')) {
                cmdCounter++;
                map[index + 1] = cmdCounter.toString();
            } else {
                map[index + 1] = '';
            }
        });

        commandIndexMapRef.current = map;

        // Force update options to re-render line numbers
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

        for (let i = 1; i <= lineCount; i++) {
            const content = model.getLineContent(i);
            const trimmed = content.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                newDecorations.push({
                    range: new monacoRef.current.Range(i, 1, i, 1),
                    options: {
                        isWholeLine: false,
                        glyphMarginClassName: 'run-glyph-margin',
                        glyphMarginHoverMessage: { value: 'Run Line' }
                    }
                });
            }
        }

        decorationsCollection.current?.set(newDecorations);
    }, []);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        decorationsCollection.current = editor.createDecorationsCollection([]);

        // Click Handler
        editor.onMouseDown((e) => {
            if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position?.lineNumber;
                if (lineNumber) executeLineRef.current(lineNumber);
            }
        });

        // Keybinding: Ctrl+Enter
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const position = editor.getPosition();
            if (position) {
                executeLineRef.current(position.lineNumber);
            }
        });

        updateDecorations();
    };

    useEffect(() => {
        updateDecorations();
    }, [content, updateDecorations]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0 relative">
                <Editor
                    height="100%"
                    defaultLanguage="text"
                    value={content}
                    onChange={(val) => setContent(val || '')}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        glyphMargin: true,
                        lineNumbers: (lineNumber) => commandIndexMapRef.current[lineNumber] || '',
                        lineNumbersMinChars: 2,
                        folding: false,
                        wordWrap: wordWrap,
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        padding: { top: 8, bottom: 8 },
                        renderLineHighlight: 'line',
                        contextmenu: false,
                    }}
                />
            </div>
            <div className="px-2 py-1 bg-muted/30 border-t border-border text-[10px] text-muted-foreground flex justify-between">
                <span>Ctrl+Enter=Run &nbsp; # Comment &nbsp; HEX: AA BB</span>
            </div>
        </div>
    );
}
