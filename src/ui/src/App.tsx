import { Component, ErrorInfo, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useEffect, useState, useCallback } from 'react';
import { SerialService, type SerialConfig } from './services/ipc';
import { TerminalContainer } from './components/Terminal/TerminalContainer';
import { type LogData } from './components/Terminal/LogEntry';
import { ControlPanel } from './components/ControlPanel';
import { CommandManager } from './components/CommandManager';
import { PanelRightClose } from 'lucide-react';
import { cn } from './lib/utils';
import { ScriptEditor } from './components/ScriptEditor';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500">
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [connected, setConnected] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [sidePanelWidth, setSidePanelWidth] = useState(288); // Default w-72 equivalent
  const [showScriptEditor, setShowScriptEditor] = useState(false);

  const [serialConfig, setSerialConfig] = useState<SerialConfig>({
    port_name: '',
    baud_rate: 115200,
    data_bits: 8,
    flow_control: 'None',
    parity: 'None',
    stop_bits: 1
  });

  useEffect(() => {
    // Listen to data
    const unlisten = SerialService.listen((data) => {
      const newEntry: LogData = {
        id: Date.now() + Math.random(), // Simple unique ID
        timestamp: Date.now(),
        type: 'RX',
        data: data
      };

      setLogs(prev => {
        // Memory safety: Limit buffer size
        const newLogs = [...prev, newEntry];
        if (newLogs.length > 10000) {
          return newLogs.slice(newLogs.length - 10000);
        }
        return newLogs;
      });
    });

    const handleToggleSidebar = () => setShowSidePanel(prev => !prev);
    window.addEventListener('toggle-sidebar', handleToggleSidebar);

    return () => {
      unlisten.then(f => f());
      window.removeEventListener('toggle-sidebar', handleToggleSidebar);
    };
  }, []);

  const handleConnect = async () => {
    try {
      if (!serialConfig.port_name) {
        addSystemLog("No port selected", 'ERR');
        return;
      }

      if (connected) {
        await SerialService.disconnect();
        setConnected(false);
      }

      await SerialService.connect(serialConfig);
      setConnected(true);
      addSystemLog(`Connected to ${serialConfig.port_name} at ${serialConfig.baud_rate}`, 'SYS');
    } catch (e: any) {
      console.error(e);
      addSystemLog(`Connection failed: ${e.toString()}`, 'ERR');
    }
  };

  const handleDisconnect = async () => {
    try {
      await SerialService.disconnect();
      setConnected(false);
      addSystemLog("Disconnected", 'SYS');
    } catch (e: any) {
      console.error(e);
      addSystemLog(`Disconnect failed: ${e.toString()}`, 'ERR');
    }
  };

  const handleSend = async (data: Uint8Array | number[]) => {
    try {
      await SerialService.send(data);
      // Log TX
      // We know it's Uint8Array because we converted it before calling send in some cases,
      // but let's ensure it for display
      const dataArr = data instanceof Uint8Array ? data : new Uint8Array(data);

      setLogs(prev => [...prev, {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        type: 'TX',
        data: dataArr
      }]);
    } catch (e: any) {
      console.error(e);
      addSystemLog(`Send failed: ${e.toString()}`, 'ERR');
    }
  };

  const addSystemLog = (msg: string, type: 'SYS' | 'ERR') => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      type,
      data: msg
    }]);
  };

  const handleClear = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <ErrorBoundary>
      <Layout>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex min-h-0 relative">

            {/* Terminal Section */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0 p-2 pb-0">
                  <div className="h-full border border-border/40 rounded-md overflow-hidden shadow-inner bg-white">
                    <TerminalContainer logs={logs} onClear={handleClear} />
                  </div>
                </div>
              </div>

              {/* Control Panel (Settings + Input) */}
              <div className="p-2 pt-0">
                <ControlPanel
                  config={serialConfig}
                  setConfig={setSerialConfig}
                  connected={connected}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onSend={handleSend}
                  onOpenScripting={() => setShowScriptEditor(true)}
                />
              </div>

              <ScriptEditor isOpen={showScriptEditor} onClose={() => setShowScriptEditor(false)} />
            </div>

            {/* Drag Handle */}

            {/* Drag Handle */}
            <div
              className={cn(
                "w-1 bg-border/50 hover:bg-primary/50 cursor-col-resize z-20 flex items-center justify-center transition-colors touch-none",
                !showSidePanel && "hidden"
              )}
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startWidth = sidePanelWidth;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(200, Math.min(600, startWidth + (startX - moveEvent.clientX)));
                  setSidePanelWidth(newWidth);
                };

                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                  document.body.style.cursor = 'default';
                  document.body.style.userSelect = 'auto';
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none'; // Prevent text selection
              }}
            />

            {/* Side Panel (Command Manager) */}
            <div
              style={{ width: showSidePanel ? sidePanelWidth : 0 }}
              className={cn(
                "border-l border-border bg-background flex flex-col transition-[width] duration-0 ease-linear", // Disable transition during drag
                !showSidePanel && "overflow-hidden border-l-0"
              )}
            >
              <div className="h-full p-2 relative">
                {/* Close Button Inside Panel */}
                {/* Close Button Inside Panel - Removed as it overlaps and is redundant with the Toolbar Toggle */}

                <CommandManager onSend={handleSend} connected={connected} />
              </div>
            </div>

            {/* Toggle Side Panel Button - Replaced by event listener in Terminal Toolbar */}
            {/* Logic handled via window event dispatch from TerminalContainer */}

            {/* Mock Mode Indicator */}
            {window.location.protocol.startsWith('http') && !('__TAURI_INTERNALS__' in window) && (
              <div className="absolute bottom-1 right-1 pointer-events-none opacity-50 bg-yellow-100 text-yellow-800 text-[10px] px-1 rounded border border-yellow-200">
                MOCK MODE
              </div>
            )}

          </div>
        </div>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
