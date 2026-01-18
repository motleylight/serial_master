import { invoke } from '@tauri-apps/api/core';

export type ScriptType = 'js' | 'external' | null;

export interface ScriptState {
    type: ScriptType;
    js: string;
    external: string;
}

class ScriptServiceClass extends EventTarget {
    // State
    private _tx: ScriptState = { type: null, js: '', external: '' };
    private _rx: ScriptState = { type: null, js: '', external: '' };

    constructor() {
        super();
        this.load();
    }

    private load() {
        // Initial load relies on config sync
    }

    // New Sync Method called by App.tsx when Config changes
    async syncState(scripts: { tx: ScriptState; rx: ScriptState }) {
        let changed = false;

        // Compare and update TX
        const txDifferent =
            scripts.tx.type !== this._tx.type ||
            scripts.tx.js !== this._tx.js ||
            scripts.tx.external !== this._tx.external;

        if (txDifferent) {
            this._tx = { ...scripts.tx };
            // Apply to backend
            const type = this._tx.type;
            // For backend, we only care about 'external' type content for pre_send
            // JS execution happens in frontend runTxHook
            if (type === 'external') {
                await invoke('set_script', { scriptType: 'pre_send', content: this._tx.external });
            } else {
                await invoke('set_script', { scriptType: 'pre_send', content: '' });
            }
            changed = true;
        }

        // Compare and update RX
        const rxDifferent =
            scripts.rx.type !== this._rx.type ||
            scripts.rx.js !== this._rx.js ||
            scripts.rx.external !== this._rx.external;

        if (rxDifferent) {
            this._rx = { ...scripts.rx };
            // Apply to backend
            const type = this._rx.type;
            if (type === 'external') {
                await invoke('set_script', { scriptType: 'rx', content: this._rx.external });
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

    async updateTx(updates: Partial<ScriptState>) {
        const newState = { ...this._tx, ...updates };
        this._tx = newState; // Optimistic update

        // Notify backend if necessary
        if (newState.type === 'external') {
            await invoke('set_script', { scriptType: 'pre_send', content: newState.external });
        } else {
            // If we switched away from external, or if we are in JS mode, clear backend
            // BUT: if we are just updating 'js' content while type is 'external', we shouldn't change backend?
            // Actually, if type is external, backend needs 'external' content.
            // If type is NOT external, backend needs empty.
            await invoke('set_script', { scriptType: 'pre_send', content: '' });
        }

        this.dispatchEvent(new Event('change'));
    }

    async updateRx(updates: Partial<ScriptState>) {
        const newState = { ...this._rx, ...updates };
        this._rx = newState;

        if (newState.type === 'external') {
            await invoke('set_script', { scriptType: 'rx', content: newState.external });
        } else {
            await invoke('set_script', { scriptType: 'rx', content: '' });
        }

        this.dispatchEvent(new Event('change'));
    }

    // Legacy/Helper wrappers if needed, but we'll try to use updateTx/Rx from UI
    // Replacing setTxScript with logic that intelligently updates the right field
    async setTxScript(type: ScriptType, content: string) {
        // This method assumes "Active Script" update.
        // So we update the 'type', AND the specific content field corresponding to that type.
        const updates: Partial<ScriptState> = { type };
        if (type === 'js') updates.js = content;
        if (type === 'external') updates.external = content;

        // Ensure null content doesn't break things (though UI sends empty string)
        await this.updateTx(updates);
    }

    async setRxScript(type: ScriptType, content: string) {
        const updates: Partial<ScriptState> = { type };
        if (type === 'js') updates.js = content;
        if (type === 'external') updates.external = content;
        await this.updateRx(updates);
    }

    async stopAll() {
        // Only reset type to null, preserve content
        await this.updateTx({ type: null });
        await this.updateRx({ type: null });

        // Backend update is handled by updateTx/updateRx calling invoke('set_script', ...)
        // Since type is null, updateTx/Rx will send empty string to backend.
    }

    // --- Execution Hooks (Frontend JS) ---

    runTxHook(data: Uint8Array | number[]): Uint8Array {
        if (this._tx.type !== 'js' || !this._tx.js.trim()) {
            return data instanceof Uint8Array ? data : new Uint8Array(data);
        }

        try {
            const dataArr = Array.from(data);
            const f = new Function('data', this._tx.js);
            const ret = f(dataArr);
            const result = Array.isArray(ret) ? ret : dataArr;
            return new Uint8Array(result);
        } catch (e) {
            console.error("Tx Script Error:", e);
            return data instanceof Uint8Array ? data : new Uint8Array(data);
        }
    }

    runRxHook(data: Uint8Array): Uint8Array {
        if (this._rx.type !== 'js' || !this._rx.js.trim()) {
            return data;
        }

        try {
            const dataArr = Array.from(data);
            const f = new Function('data', this._rx.js);
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
