'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Wifi, WifiOff, QrCode } from 'lucide-react';

interface WhatsAppStatus {
  connected: boolean;
  phoneNumber?: string;
  lastSeen?: string;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/whatsapp/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const connectQrStream = () => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/admin/whatsapp/qr');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'qr') {
        setQrCode(data.qr);
      } else if (data.type === 'connected') {
        setStatus({ connected: true, phoneNumber: data.phoneNumber });
        setQrCode(null);
      } else if (data.type === 'disconnected') {
        setStatus({ connected: false });
      }
    };

    eventSource.onerror = () => {
      setError('Lost connection to QR stream');
      eventSource.close();
    };
  };

  useEffect(() => {
    fetchStatus();
    connectQrStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp?')) return;

    try {
      const response = await fetch('/api/admin/whatsapp/logout', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to logout');
      setStatus({ connected: false });
      setQrCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp</h1>
          <p className="mt-2 text-gray-600">
            Manage your WhatsApp connection and view QR code for linking.
          </p>
        </div>
        <Button onClick={fetchStatus} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status?.connected ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              Connection Status
            </CardTitle>
            <CardDescription>
              Current WhatsApp connection state
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Status</span>
                  <Badge variant={status?.connected ? 'success' : 'destructive'}>
                    {status?.connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
                {status?.phoneNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Phone</span>
                    <span className="font-mono">{status.phoneNumber}</span>
                  </div>
                )}
                {status?.connected && (
                  <Button
                    onClick={handleLogout}
                    variant="destructive"
                    className="w-full mt-4"
                  >
                    Disconnect WhatsApp
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code
            </CardTitle>
            <CardDescription>
              Scan with WhatsApp to link your device
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status?.connected ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Wifi className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-gray-600">Already connected!</p>
                <p className="text-sm text-gray-500 mt-2">
                  Disconnect to show a new QR code.
                </p>
              </div>
            ) : qrCode ? (
              <div className="flex flex-col items-center">
                <div
                  className="bg-white p-4 rounded-lg"
                  dangerouslySetInnerHTML={{ __html: qrCode }}
                />
                <p className="mt-4 text-sm text-gray-500">
                  Open WhatsApp {">"} Settings {">"} Linked Devices {">"} Link a Device
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mb-4" />
                <p className="text-gray-600">Waiting for QR code...</p>
                <p className="text-sm text-gray-500 mt-2">
                  Make sure the API server is running with ENABLE_WHATSAPP=true
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
