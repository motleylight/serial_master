import React from 'react';

export const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground">
            {/* Main Content Area (Terminal) */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
                <div className="flex-1 font-mono text-sm overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};
