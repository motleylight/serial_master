import React from 'react';

export const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground">
            {/* Sidebar Area */}
            <aside className="w-64 border-r border-border bg-card p-4 flex flex-col">
                <h1 className="text-xl font-bold mb-6">SerialMaster</h1>
                <nav className="flex-1 space-y-2">
                    <div className="p-2 hover:bg-accent rounded cursor-pointer">Start Page</div>
                    <div className="p-2 hover:bg-accent rounded cursor-pointer">Devices</div>
                    <div className="p-2 hover:bg-accent rounded cursor-pointer">Settings</div>
                </nav>
                <div className="text-xs text-muted-foreground">v0.1.0</div>
            </aside>

            {/* Main Content Area (Terminal) */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
                <header className="h-12 border-b border-border flex items-center px-4">
                    <span className="font-mono text-sm">COM8 - 115200 8N1</span>
                </header>
                <div className="flex-1 p-4 font-mono text-sm overflow-auto">
                    {children}
                </div>
            </main>

            {/* Command Panel Area */}
            <aside className="w-80 border-l border-border bg-card p-4 flex flex-col">
                <h2 className="font-semibold mb-4">Commands</h2>
                <div className="space-y-2">
                    <button className="w-full text-left p-2 border border-border rounded hover:bg-accent text-sm">
                        PING (AA 55)
                    </button>
                    <button className="w-full text-left p-2 border border-border rounded hover:bg-accent text-sm">
                        RESET (FF FF)
                    </button>
                </div>
            </aside>
        </div>
    );
};
