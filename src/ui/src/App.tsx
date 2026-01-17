import { Component, ErrorInfo, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useEffect, useState, useCallback, useRef } from 'react';
import { SerialService, type SerialConfig } from './services/ipc';
import { TerminalContainer } from './components/Terminal/TerminalContainer';
import { type LogData } from './components/Terminal/LogEntry';
import { ControlPanel } from './components/ControlPanel';
import { CommandManager } from './components/CommandManager';
import { cn } from './lib/utils';
import { ScriptEditor } from './components/ScriptEditor';
import { ScriptService } from './services/ScriptService';
import { useAppConfig } from './hooks/useAppConfig';
import { PortSharingDialog } from './components/PortSharingDialog';

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

const MAX_LOG_COUNT = 10000;
const BATCH_UPDATE_INTERVAL = 100; // ms

function App() {
  const { config, updateSerialConfig, updateTerminalConfig, updateSendConfig, updateUiConfig, updatePathsConfig, updateScriptConfig, loaded } = useAppConfig();
  const serialConfig = config.serial;
  const uiConfig = config.ui;

  const [logs, setLogs] = useState<LogData[]>([]);
  const [connected, setConnected] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [showPortSharing, setShowPortSharing] = useState(false);



  // Buffer for batch updates - reduces render frequency significantly
  const logBufferRef = useRef<LogData[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Counter for unique IDs (more reliable than Date.now() + random)
  const logIdCounterRef = useRef(0);

  // Sync Script Config <-> Script Service
  // 1. Config -> Service (Initial Load & Updates)
  useEffect(() => {
    // Avoid loops: ScriptService.syncState checks if actually changed before doing work or firing events
    ScriptService.syncState(config.scripts);
  }, [config.scripts]);

  // 2. Service -> Config (User Actions)
  useEffect(() => {
    const handleScriptChange = () => {
      const tx = ScriptService.txState;
      const rx = ScriptService.rxState;
      // Verify if different from config to avoid loops
      if (JSON.stringify(config.scripts.tx) !== JSON.stringify(tx) ||
        JSON.stringify(config.scripts.rx) !== JSON.stringify(rx)) {
        updateScriptConfig({ tx, rx });
      }
    };
    ScriptService.addEventListener('change', handleScriptChange);
    return () => ScriptService.removeEventListener('change', handleScriptChange);
  }, [config.scripts, updateScriptConfig]);


  // Flush buffer to state
  const flushLogBuffer = useCallback(() => {
    if (logBufferRef.current.length === 0) return;

    const bufferedLogs = logBufferRef.current;
    logBufferRef.current = [];

    setLogs(prev => {
      const newLogs = [...prev, ...bufferedLogs];
      // Trim excess logs
      if (newLogs.length > MAX_LOG_COUNT) {
        return newLogs.slice(newLogs.length - MAX_LOG_COUNT);
      }
      return newLogs;
    });
  }, []);

  useEffect(() => {
    // Start batch update timer
    batchTimerRef.current = setInterval(flushLogBuffer, BATCH_UPDATE_INTERVAL);

    // Listen to data - now buffers instead of immediate setState
    const unlisten = SerialService.listen((data) => {
      // Apply Rx JS Hook
      const processed = ScriptService.runRxHook(data);
      if (processed.length === 0) return; // Drop

      const newEntry: LogData = {
        id: ++logIdCounterRef.current,
        timestamp: Date.now(),
        type: 'RX',
        data: processed
      };
      logBufferRef.current.push(newEntry);
    });

    const handleToggleSidebar = () => updateUiConfig({ sidebarVisible: !uiConfig.sidebarVisible });
    window.addEventListener('toggle-sidebar', handleToggleSidebar);

    return () => {
      // Cleanup timer
      if (batchTimerRef.current) {
        clearInterval(batchTimerRef.current);
      }
      // Flush any remaining buffered logs
      flushLogBuffer();
      unlisten.then(f => f());
      window.removeEventListener('toggle-sidebar', handleToggleSidebar);
    };
  }, [flushLogBuffer, uiConfig.sidebarVisible, updateUiConfig]);

  const handleConnect = async (configOverride?: SerialConfig) => {
    const configToUse = configOverride || serialConfig;
    try {
      if (!configToUse.port_name) {
        addSystemLog("No port selected", 'ERR');
        return;
      }

      if (connected) {
        await SerialService.disconnect();
        setConnected(false);
      }

      await SerialService.connect(configToUse);
      setConnected(true);
      addSystemLog(`Connected to ${configToUse.port_name} at ${configToUse.baud_rate}`, 'SYS');
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

  const handleConfigUpdate = (newConfig: SerialConfig) => {
    updateSerialConfig(newConfig);
    if (connected) {
      // Hot-reload: Reconnect with new config
      // Pass newConfig explicitly to avoid stale state
      handleConnect(newConfig);
    }
  };

  const handleSend = async (data: Uint8Array | number[]) => {
    try {
      // Apply JS Tx Hook (if any)
      // If external hook is active in backend, this will likely be pass-through (empty js script)
      const processedData = ScriptService.runTxHook(data);

      await SerialService.send(processedData);

      setLogs(prev => [...prev, {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        type: 'TX',
        data: processedData
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

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Loading configuration...</span>
        </div>
      </div>
    );
  }

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
                    <TerminalContainer
                      logs={logs}
                      setLogs={setLogs}
                      onClear={handleClear}
                      config={config.terminal}
                      onConfigChange={updateTerminalConfig}
                    />
                  </div>
                </div>
              </div>

              {/* Control Panel (Settings + Input) */}
              <div className="p-2 pt-0">
                <ControlPanel
                  config={serialConfig}
                  setConfig={handleConfigUpdate}
                  connected={connected}
                  onConnect={() => handleConnect()}
                  onDisconnect={handleDisconnect}
                  onSend={handleSend}
                  onOpenScripting={() => setShowScriptEditor(true)}
                  sendConfig={config.send}
                  onSendConfigChange={updateSendConfig}
                  onOpenPortSharing={() => setShowPortSharing(true)}
                  ui={uiConfig}
                  onUiUpdate={updateUiConfig}
                />
              </div>

              <ScriptEditor isOpen={showScriptEditor} onClose={() => setShowScriptEditor(false)} />
              <PortSharingDialog
                isOpen={showPortSharing}
                onClose={() => setShowPortSharing(false)}
                currentPhysicalPort={serialConfig.port_name}
                currentBaudRate={serialConfig.baud_rate}
              />
            </div>

            {/* Drag Handle */}

            {/* Drag Handle */}
            <div
              className={cn(
                "w-1 bg-border/50 hover:bg-primary/50 cursor-col-resize z-20 flex items-center justify-center transition-colors touch-none",
                !uiConfig.sidebarVisible && "hidden"
              )}
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startWidth = uiConfig.sidebarWidth;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(200, Math.min(600, startWidth + (startX - moveEvent.clientX)));
                  updateUiConfig({ sidebarWidth: newWidth });
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
              style={{ width: uiConfig.sidebarVisible ? uiConfig.sidebarWidth : 0 }}
              className={cn(
                "border-l border-border bg-background flex flex-col transition-[width] duration-0 ease-linear", // Disable transition during drag
                !uiConfig.sidebarVisible && "overflow-hidden border-l-0"
              )}
            >
              <div className="h-full p-2 relative">
                {/* Close Button Inside Panel */}
                {/* Close Button Inside Panel - Removed as it overlaps and is redundant with the Toolbar Toggle */}

                <CommandManager
                  onSend={handleSend}
                  connected={connected}
                  filePath={config.paths.commandsFile}
                  onFilePathChange={(path) => updatePathsConfig({ commandsFile: path })}
                />
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
