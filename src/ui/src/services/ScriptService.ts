import { invoke } from '@tauri-apps/api/core';

type ScriptType = 'js' | 'external' | null;

interface ScriptState {
    type: ScriptType;
    content: string;
}

class ScriptServiceClass extends EventTarget {
    // State
    private _tx: ScriptState = { type: null, content: '' };
    private _rx: ScriptState = { type: null, content: '' };

    constructor() {
        super();
        this.load();
    }

    private load() {
        // Initial load now relies on config sync, but we can't assume config is ready yet.
        // We initialize with empty.
        // Migration legacy: clean up old keys if present?
        // Let's leave them for now in case of rollback.
    }

    // New Sync Method called by App.tsx when Config changes
    // But we need to be careful not to create a loop if we are the ones who triggered it.
    // However, App.tsx will only update config if we told it to.
    // When config loads from disk, it calls this.
    async syncState(scripts: { tx: ScriptState; rx: ScriptState }) {
        let changed = false;

        // Compare and update TX
        if (scripts.tx.type !== this._tx.type || scripts.tx.content !== this._tx.content) {
            this._tx = { ...scripts.tx };
            // Apply to backend
            const type = this._tx.type;
            const content = this._tx.content;
            if (type === 'external') {
                await invoke('set_script', { scriptType: 'pre_send', content });
            } else {
                await invoke('set_script', { scriptType: 'pre_send', content: '' });
            }
            changed = true;
        }

        // Compare and update RX
        if (scripts.rx.type !== this._rx.type || scripts.rx.content !== this._rx.content) {
            this._rx = { ...scripts.rx };
            // Apply to backend
            const type = this._rx.type;
            const content = this._rx.content;
            if (type === 'external') {
                await invoke('set_script', { scriptType: 'rx', content });
            } else {
                await invoke('set_script', { scriptType: 'rx', content: '' });
            }
            changed = true;
        }

        if (changed) {
            this.dispatchEvent(new Event('change'));
        }
    }


    get txState() { return { ...this._tx }; }
    get rxState() { return { ...this._rx }; }

    // --- Actions ---

    async setTxScript(type: ScriptType, content: string) {
        if (!content) type = null;
        this._tx = { type, content };

        if (type === 'external') {
            await invoke('set_script', { scriptType: 'pre_send', content });
        } else {
            await invoke('set_script', { scriptType: 'pre_send', content: '' });
        }
        this.dispatchEvent(new Event('change'));
    }

    async setRxScript(type: ScriptType, content: string) {
        if (!content) type = null;
        this._rx = { type, content };

        if (type === 'external') {
            await invoke('set_script', { scriptType: 'rx', content });
        } else {
            await invoke('set_script', { scriptType: 'rx', content: '' });
        }
        this.dispatchEvent(new Event('change'));
    }

    async clearAll() {
        this._tx = { type: null, content: '' };
        this._rx = { type: null, content: '' };

        await invoke('set_script', { scriptType: 'pre_send', content: '' });
        await invoke('set_script', { scriptType: 'rx', content: '' });

        this.dispatchEvent(new Event('change'));
    }

    // --- Execution Hooks (Frontend JS) ---

    runTxHook(data: Uint8Array | number[]): Uint8Array {
        if (this._tx.type !== 'js' || !this._tx.content.trim()) {
            return data instanceof Uint8Array ? data : new Uint8Array(data);
        }

        try {
            const dataArr = Array.from(data);
            const f = new Function('data', this._tx.content);
            const ret = f(dataArr);
            const result = Array.isArray(ret) ? ret : dataArr;
            return new Uint8Array(result);
        } catch (e) {
            console.error("Tx Script Error:", e);
            return data instanceof Uint8Array ? data : new Uint8Array(data);
        }
    }

    runRxHook(data: Uint8Array): Uint8Array {
        if (this._rx.type !== 'js' || !this._rx.content.trim()) {
            return data;
        }

        try {
            const dataArr = Array.from(data);
            const f = new Function('data', this._rx.content);
            const ret = f(dataArr);

            if (ret === null || (Array.isArray(ret) && ret.length === 0)) {
                return new Uint8Array(0);
            }
            const result = Array.isArray(ret) ? ret : dataArr;
            return new Uint8Array(result);
        } catch (e) {
            console.error("Rx Script Error:", e);
            return data;
        }
    }
}

export const ScriptService = new ScriptServiceClass();
