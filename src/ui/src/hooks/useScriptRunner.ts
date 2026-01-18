import { useState, useRef, useCallback, useEffect } from 'react';

type ScriptStatus = 'idle' | 'running' | 'stopping' | 'error';

interface UseScriptRunnerProps {
    onSend: (data: Uint8Array) => void;
    onLog?: (msg: string) => void;
    onError?: (err: string) => void;
}

export function useScriptRunner({ onSend, onLog, onError }: UseScriptRunnerProps) {
    const [status, setStatus] = useState<ScriptStatus>('idle');
    const workerRef = useRef<Worker | null>(null);

    // --- Worker Code as String ---
    // --- Worker Code as String ---
    const workerCode = `
        const queue = [];
        let waitingResolver = null;
        let cmd = [];

        // Custom APIs
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const send = (data) => {
            self.postMessage({ type: 'send', data });
        };

        const recv_hex = (timeout = 1000) => {
            return new Promise(resolve => {
                if (queue.length > 0) {
                    resolve(queue.shift());
                    return;
                }

                // Set up wait
                let timer = null;

                const cleanup = () => {
                    waitingResolver = null;
                    if (timer) clearTimeout(timer);
                };

                waitingResolver = (data) => {
                    cleanup();
                    resolve(data);
                };

                if (timeout > 0) {
                    timer = setTimeout(() => {
                        cleanup();
                        resolve(null); // Timeout
                    }, timeout);
                }
            });
        };

        const recv = async (timeout = 1000) => {
            const bytes = await recv_hex(timeout);
            if (!bytes) return null;
            return new TextDecoder().decode(bytes);
        }

        const log = (msg) => {
            self.postMessage({ type: 'log', data: msg });
        };

        self.onmessage = async (e) => {
            const { type, data, code } = e.data;

            if (type === 'data_input') {
                if (waitingResolver) {
                    waitingResolver(new Uint8Array(data));
                } else {
                    queue.push(new Uint8Array(data));
                    // Optional: limit queue size?
                    if (queue.length > 100) queue.shift();
                }
                return;
            }

            if (type === 'cmd_init') {
                cmd = data || [];
                return;
            }

            if (type === 'run') {
                try {
                    // Use AsyncFunction constructor to allow top-level await in script
                    // and pass API functions explicitly.
                    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                    const func = new AsyncFunction('send', 'delay', 'recv', 'recv_hex', 'log', 'cmd', code);
                    await func(send, delay, recv, recv_hex, log, cmd);

                    self.postMessage({ type: 'finish' });
                } catch (err) {
                    self.postMessage({ type: 'error', error: err.toString() });
                }
            }
        };
    `;

    const terminate = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setStatus('idle');
    }, []);

    const run = useCallback((code: string, commands: string[] = []) => {
        terminate(); // Ensure clean state

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        workerRef.current = worker;

        setStatus('running');

        // Initialize commands
        worker.postMessage({ type: 'cmd_init', data: commands });

        worker.onmessage = (e) => {
            const { type, data, error } = e.data;
            if (type === 'send') {
                // Convert data to Uint8Array if likely
                // Worker sends whatever 'send' got.
                let payload: Uint8Array;

                if (typeof data === 'string') {
                    const trimmed = data.trim();
                    if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
                        // Hex String Parse (*AA BB*)
                        const hex = trimmed.substring(1, trimmed.length - 1).replace(/[^0-9A-Fa-f]/g, '');
                        payload = new Uint8Array(Math.ceil(hex.length / 2));
                        for (let i = 0; i < hex.length; i += 2) {
                            // Handle potential odd length by grabbing 2 or 1 char
                            const chunk = hex.substring(i, i + 2);
                            payload[i / 2] = parseInt(chunk, 16);
                        }
                    } else {
                        payload = new TextEncoder().encode(data);
                    }
                } else if (Array.isArray(data)) {
                    payload = new Uint8Array(data);
                } else {
                    payload = new Uint8Array(data); // Assume it's array-like or buffer
                }
                onSend(payload);
            } else if (type === 'log') {
                onLog?.(data);
            } else if (type === 'error') {
                onError?.(error);
                setStatus('error'); // Or idle?
                // Don't terminate immediately, let user see error? 
                // Usually error stops script.
                terminate(); // Worker is dead effectively if uncaught error, but eval wrapping catches it.
                setStatus('error');
            } else if (type === 'finish') {
                setStatus('idle');
                terminate();
            }
        };

        worker.onerror = (err) => {
            console.error("Worker Error", err);
            onError?.(err.message);
            setStatus('error');
            terminate();
        };

        // --- Pre-processing / Syntax Sugar ---
        // 1. delay(x) -> await delay(x)
        // 2. recv(x) -> await recv(x)
        // 3. recv_hex(x) -> await recv_hex(x)
        // Avoid replacing already awaited calls
        let processedCode = code;

        // Replace 'delay(' with 'await delay(' if not preceded by await
        processedCode = processedCode.replace(/(?<!await\s+)\bdelay\s*\(/g, 'await delay(');

        // Replace 'recv(' with 'await recv(' if not preceded by await
        processedCode = processedCode.replace(/(?<!await\s+)\brecv\s*\(/g, 'await recv(');

        // Replace 'recv_hex(' with 'await recv_hex(' if not preceded by await
        processedCode = processedCode.replace(/(?<!await\s+)\brecv_hex\s*\(/g, 'await recv_hex(');

        worker.postMessage({ type: 'run', code: processedCode });

    }, [onSend, onLog, onError, terminate, workerCode]);

    // Feed data to worker if running
    const feedData = useCallback((data: Uint8Array) => {
        if (status === 'running' && workerRef.current) {
            // Transferrable? Buffer copying is fine for small Serial packets.
            workerRef.current.postMessage({ type: 'data_input', data: data }, [data.buffer.slice(0) === data.buffer ? data.buffer : new Uint8Array(data).buffer]);
            // Note: Transferring might detach the buffer from main thread use? 
            // Better to clone for now to be safe with React state elsewhere? 
            // Serial data is small.
            // Actually, if we use `onSend` (which comes from serial port), `data` here IS the incoming data.
            // We should just postMessage it. 
        }
    }, [status]);

    // Cleanup
    useEffect(() => {
        return () => {
            terminate();
        };
    }, []);

    return {
        run,
        terminate,
        feedData,
        status
    };
}
