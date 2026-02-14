import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatPercentage } from '@/lib/format';
import { ArrowLeft, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type SenderSummary = Tables<'sender_summary'>;

const ScanSummary = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [senders, setSenders] = useState<SenderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !scanId) return;

    const fetchSenders = async () => {
      const { data, error } = await supabase
        .from('sender_summary')
        .select('*')
        .eq('scan_id', scanId)
        .eq('user_id', user.id)
        .gte('unopened_percentage', 75)
        .order('total_size_bytes', { ascending: false });

      if (error) {
        toast.error('Failed to load sender summary');
      } else {
        setSenders(data || []);
      }
      setLoading(false);
    };

    fetchSenders();
  }, [user, scanId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="animate-pulse text-muted-foreground">Loading summary...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Scan Summary</h1>
              <p className="text-sm text-muted-foreground">
                Senders with ≥75% unopened emails • Sorted by size
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate(`/purge/${scanId}`)}
            disabled={senders.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Purge & Unsubscribe
          </Button>
        </div>

        {senders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Check className="mb-4 h-12 w-12 text-primary/50" />
              <h3 className="mb-1 text-lg font-medium">Inbox looks clean!</h3>
              <p className="text-sm text-muted-foreground">
                No senders found with ≥75% unopened emails
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {senders.length} sender{senders.length !== 1 ? 's' : ''} to review
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender</TableHead>
                    <TableHead className="text-right">Total Emails</TableHead>
                    <TableHead className="text-right">% Unopened</TableHead>
                    <TableHead className="text-right">Total Size</TableHead>
                    <TableHead className="text-center">Unsubscribe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {senders.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{s.sender_name || s.sender_email}</div>
                          {s.sender_name && (
                            <div className="text-xs text-muted-foreground">{s.sender_email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{s.total_emails}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={s.unopened_percentage >= 90 ? 'destructive' : 'secondary'}>
                          {formatPercentage(s.unopened_percentage)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatBytes(s.total_size_bytes)}</TableCell>
                      <TableCell className="text-center">
                        {s.has_unsubscribe_link ? (
                          <Check className="mx-auto h-4 w-4 text-primary" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                        )}
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

export default ScanSummary;
