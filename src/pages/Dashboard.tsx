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
import { RefreshCw, Search, Eye, Inbox, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type ScanHistory = Tables<'scan_history'>;

const Dashboard = () => {
  const { user, session, signOut } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanHistory | null>(null);

  const getProviderTokens = () => {
    const provider_token = session?.provider_token || localStorage.getItem('google_provider_token');
    const provider_refresh_token = session?.provider_refresh_token || localStorage.getItem('google_provider_refresh_token');
    return { provider_token, provider_refresh_token };
  };

  // Check if session has provider_token (Gmail access)
  const { provider_token, provider_refresh_token } = getProviderTokens();
  const hasGmailAccess = !!provider_token;
  const showBanner = !provider_token && !provider_refresh_token;

  const fetchScans = async () => {
    if (!user) return;
    const { data, error } = await supabase
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
  }, [activeScan?.id]);

  const startScan = async (rescan = false) => {
    // Get fresh session to have provider_token
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    
    if (!currentSession) {
      toast.error('Not authenticated. Please sign in again.');
      return;
    }

    const { provider_token, provider_refresh_token } = getProviderTokens();

    if (!provider_token) {
      toast.error('Gmail access not available. Please sign out and sign back in to grant access.');
      return;
    }

    setScanning(true);
    try {
      const res = await supabase.functions.invoke('scan-mailbox', {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: { 
          rescan,
          provider_token,
          provider_refresh_token,
        },
      });

      if (res.error) {
        const errorMsg = res.data?.error || res.error.message || 'Scan failed';
        toast.error(errorMsg);
        setScanning(false);
      } else {
        const scanId = res.data?.scan_id;
        if (scanId) {
          const { data } = await supabase
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
        {/* Gmail Access Warning Banner */}
        {showBanner && (
          <Card className="mb-6 border-destructive/50 bg-destructive/10">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Gmail access not available</p>
                <p className="text-xs text-muted-foreground">Please sign out and sign back in to grant Gmail access for scanning.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={signOut}>
                Sign Out & Re-authorize
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Scan your Gmail inbox and clean up clutter</p>
          </div>
          <div className="flex gap-2">
            {hasScans && (
              <Button variant="outline" onClick={() => startScan(true)} disabled={scanning || !hasGmailAccess}>
                <RefreshCw className={`mr-2 h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
                Rescan
              </Button>
            )}
            <Button onClick={() => startScan(false)} disabled={scanning || !hasGmailAccess}>
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
                <span className="font-medium text-primary">Scanning...</span>
                <span className="text-muted-foreground">{activeScan.progress}%</span>
              </div>
              <Progress value={activeScan.progress} className="h-2" />
              {activeScan.progress_message && (
                <p className="mt-2 text-xs text-muted-foreground">{activeScan.progress_message}</p>
              )}
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
              <Button onClick={() => startScan(false)} disabled={!hasGmailAccess}>
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
                      <TableCell className="text-right">{scan.deletable_mails}</TableCell>
                      <TableCell className="text-right">{formatBytes(scan.recoverable_space)}</TableCell>
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
