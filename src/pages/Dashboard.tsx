import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { formatBytes, formatDate } from '@/lib/format';
import { RefreshCw, Search, Eye, Inbox } from 'lucide-react';
import { toast } from 'sonner';
interface ScanHistory {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_emails: number;
  total_senders: number;
  senders_deleted: number;
  mails_deleted: number;
  space_scanned: number;
  space_recovered: number;
  space_recoverable: number;
  deletable_senders: number;
  deletable_emails: number;
}

const Dashboard = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanHistory | null>(null);

  const fetchScans = async () => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('scan_history')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false });

    if (error) {
      toast.error('Failed to load scan history');
    } else {
      setScans(data || []);
      const active = data?.find((s) => s.status === 'in_progress');
      if (active) {
        setActiveScan(active);
        setScanning(true);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchScans();
  }, [user]);

  // Realtime updates for active scan
  useEffect(() => {
    if (!activeScan) return;
    const channel = supabase
      .channel(`scan-${activeScan.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'scan_history',
        filter: `id=eq.${activeScan.id}`,
      }, (payload) => {
        const updated = payload.new as ScanHistory;
        setActiveScan(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          setScanning(false);
          setActiveScan(null);
          fetchScans();
          if (updated.status === 'completed') {
            toast.success('Scan completed!');
          } else {
            toast.error('Scan failed');
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeScan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startScan = async (rescan = false) => {
    if (!session?.provider_token && !session?.access_token) {
      toast.error('Please sign in again to grant Gmail access');
      return;
    }

    setScanning(true);
    try {
      const res = await supabase.functions.invoke('scan-mailbox', {
        body: { rescan },
      });

      if (res.error) {
        toast.error(res.error.message || 'Scan failed');
        setScanning(false);
      } else {
        const scanId = res.data?.scan_id;
        if (scanId) {
          // Fetch the newly created scan to track it
          const { data } = await (supabase as any)
            .from('scan_history')
            .select('*')
            .eq('id', scanId)
            .single();
          if (data) setActiveScan(data);
        }
        toast.success('Scan started!');
      }
    } catch {
      toast.error('Failed to start scan');
      setScanning(false);
    }
  };

  const hasScans = scans.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Scan your Gmail inbox and clean up clutter</p>
          </div>
          <div className="flex gap-2">
            {hasScans && (
              <Button variant="outline" onClick={() => startScan(true)} disabled={scanning}>
                <RefreshCw className={`mr-2 h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
                Rescan
              </Button>
            )}
            <Button onClick={() => startScan(false)} disabled={scanning}>
              <Search className="mr-2 h-4 w-4" />
              {hasScans ? 'New Scan' : 'Scan Mailbox'}
            </Button>
          </div>
        </div>

        {/* Active Scan Progress */}
        {scanning && activeScan && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-primary">Scanning in progress...</span>
                <span className="text-muted-foreground">{activeScan.status}</span>
              </div>
              <Progress value={activeScan.status === 'completed' ? 100 : 50} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !hasScans && !scanning && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Inbox className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-1 text-lg font-medium">No scans yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Scan your mailbox to identify clutter and free up space
              </p>
              <Button onClick={() => startScan(false)}>
                <Search className="mr-2 h-4 w-4" />
                Scan Mailbox
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Scan History Table */}
        {hasScans && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scan History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scan Time</TableHead>
                    <TableHead className="text-right">Senders Deleted</TableHead>
                    <TableHead className="text-right">Mails Deleted</TableHead>
                    <TableHead className="text-right">Space Recovered</TableHead>
                    <TableHead className="text-right">Deletable Senders</TableHead>
                    <TableHead className="text-right">Deletable Mails</TableHead>
                    <TableHead className="text-right">Recoverable Space</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium">
                        {formatDate(scan.started_at)}
                        {scan.status === 'in_progress' && (
                          <span className="ml-2 text-xs text-primary">(in progress)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{scan.senders_deleted}</TableCell>
                      <TableCell className="text-right">{scan.mails_deleted}</TableCell>
                      <TableCell className="text-right">{formatBytes(scan.space_recovered)}</TableCell>
                      <TableCell className="text-right">{scan.deletable_senders}</TableCell>
                      <TableCell className="text-right">{scan.deletable_emails}</TableCell>
                      <TableCell className="text-right">{formatBytes(scan.space_recoverable)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/scan/${scan.id}`)}
                          disabled={scan.status !== 'completed'}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
