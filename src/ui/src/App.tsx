import { Component, ErrorInfo, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useEffect, useState, useCallback } from 'react';
import { SerialService, type SerialConfig } from './services/ipc';
import { TerminalContainer } from './components/Terminal/TerminalContainer';
import { type LogData } from './components/Terminal/LogEntry';
import { SettingsPanel } from './components/SettingsPanel';
import { InputArea } from './components/InputArea';
import { CommandManager } from './components/CommandManager';
import { PanelRightClose, Sidebar } from 'lucide-react';
import { cn } from './lib/utils';

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

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const handleConnect = async () => {
    try {
      if (!serialConfig.port_name) {
        addSystemLog("No port selected", 'ERR');
        return;
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
          {/* Top Settings Panel */}
          <SettingsPanel
            config={serialConfig}
            setConfig={setSerialConfig}
            connected={connected}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

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

              {/* Input Area */}
              <div className="p-2 pt-0">
                <InputArea onSend={handleSend} connected={connected} />
              </div>
            </div>

            {/* Side Panel (Command Manager) */}
            <div
              className={cn(
                "border-l border-border bg-background transition-all duration-300 ease-in-out flex flex-col",
                showSidePanel ? "w-72" : "w-0 opacity-0 overflow-hidden"
              )}
            >
              <div className="h-full p-2">
                <CommandManager onSend={handleSend} connected={connected} />
              </div>
            </div>

            {/* Toggle Side Panel Button */}
            <div className="absolute top-2 right-2 z-10">
              {!showSidePanel && (
                <button
                  onClick={() => setShowSidePanel(true)}
                  className="p-1 bg-background border border-border rounded-md shadow hover:bg-muted"
                  title="Show Command Panel"
                >
                  <Sidebar className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {showSidePanel && (
              <button
                onClick={() => setShowSidePanel(false)}
                className="absolute top-3 right-3 z-10 p-1 hover:bg-black/10 rounded"
                title="Hide Command Panel"
              >
                <PanelRightClose className="w-3.5 h-3.5 text-muted-foreground/50" />
              </button>
            )}

          </div>
        </div>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
