'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

interface LogViewerProps {
  deploymentId: string;
  className?: string;
  height?: string | number;
}

export function LogViewer({ deploymentId, className, height = 600 }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!deploymentId) return;

    const connectWebSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.cygni.io';
      const ws = new WebSocket(`${wsUrl}/deployments/${deploymentId}/logs/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        if (isPaused) return;
        
        try {
          const logEntry = JSON.parse(event.data) as LogEntry;
          setLogs((prev) => [...prev.slice(-999), logEntry]); // Keep last 1000 logs
          
          if (autoScroll && containerRef.current) {
            setTimeout(() => {
              containerRef.current?.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }, 100);
          }
        } catch (error) {
          console.error('Failed to parse log entry:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [deploymentId, isPaused, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'all' && log.level !== levelFilter) {
      return false;
    }
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    return true;
  });

  const levelColors = {
    info: 'text-blue-600',
    warn: 'text-yellow-600',
    error: 'text-red-600',
    debug: 'text-gray-500',
  };

  const levelBgColors = {
    info: 'bg-blue-50',
    warn: 'bg-yellow-50',
    error: 'bg-red-50',
    debug: 'bg-gray-50',
  };

  return (
    <div className={cn('flex flex-col bg-white rounded-lg shadow', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">Logs</h3>
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'p-1 rounded hover:bg-gray-100',
              autoScroll && 'bg-gray-100'
            )}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1 rounded hover:bg-gray-100"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <PlayIcon className="w-4 h-4" />
            ) : (
              <PauseIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-sm"
        style={{ height }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {filter || levelFilter !== 'all' 
              ? 'No logs match your filters' 
              : 'Waiting for logs...'}
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-2 px-2 py-1 rounded hover:bg-gray-50',
                  log.level === 'error' && 'hover:bg-red-50'
                )}
              >
                <span className="text-gray-400 select-none">
                  {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                </span>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded',
                  levelColors[log.level],
                  levelBgColors[log.level]
                )}>
                  {log.level.toUpperCase()}
                </span>
                <span className="flex-1 break-all whitespace-pre-wrap">
                  {log.message}
                  {log.metadata && (
                    <span className="ml-2 text-gray-400">
                      {JSON.stringify(log.metadata)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-sm text-gray-600 border-t">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
    </div>
  );
}