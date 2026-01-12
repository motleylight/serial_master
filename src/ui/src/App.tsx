import { Component, ErrorInfo, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useEffect, useState, useCallback } from 'react';
import { SerialService, type SerialPortInfo } from './services/ipc';
import { TerminalContainer } from './components/Terminal/TerminalContainer';
import { type LogData } from './components/Terminal/LogEntry';

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
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [logs, setLogs] = useState<LogData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Load ports on start
    SerialService.getPorts().then(setPorts).catch(console.error);

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
      await SerialService.connect("COM8", 115200);
      setConnected(true);
      addSystemLog("Connected to COM8", 'SYS');
    } catch (e) {
      console.error(e);
      addSystemLog(`Connection failed: ${e}`, 'ERR');
    }
  };

  const handleSend = async () => {
    try {
      const msg = "Hello Rust!";
      await SerialService.send(msg);
      addSystemLog(msg, 'TX', msg);
    } catch (e) {
      console.error(e);
    }
  };

  const addSystemLog = (msg: string, type: 'SYS' | 'ERR' | 'TX', rawData?: string) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      type,
      data: rawData || msg
    }]);
  };

  const handleClear = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <ErrorBoundary>
      <Layout>
        <div className="flex flex-col h-full space-y-2">
          <div className="flex justify-between items-center px-1">
            <div className="text-xs text-muted-foreground">Available Ports: {ports.length}</div>
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={connected}
                className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {connected ? "Connected" : "Connect COM8"}
              </button>
              <button
                onClick={handleSend}
                disabled={!connected}
                className="bg-secondary text-secondary-foreground px-3 py-1 rounded text-xs disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                Send Hello
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 border border-border/40 rounded-md overflow-hidden shadow-inner">
            <TerminalContainer logs={logs} onClear={handleClear} />
          </div>
        </div>
      </Layout>
    </ErrorBoundary>
  );
}

export default App;
