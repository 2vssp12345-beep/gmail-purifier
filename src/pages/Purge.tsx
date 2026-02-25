import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatBytes, formatDate, formatPercentage } from '@/lib/format';
import { ArrowLeft, ChevronDown, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
interface SenderSummary {
  id: string;
  scan_id: string;
  user_id: string;
  sender_name: string | null;
  sender_email: string;
  total_emails: number;
  unopened_count: number;
  unopened_percentage: number;
  total_size_bytes: number;
  has_unsubscribe_link: boolean;
}

interface EmailMetadata {
  id: string;
  scan_id: string;
  user_id: string;
  email_id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  received_date: string | null;
  size_bytes: number;
  is_opened: boolean;
  has_unsubscribe_link: boolean;
  unsubscribe_url: string | null;
}

type RetentionAction = 'skip' | 'delete_all' | 'retain_latest' | 'retain_1_in_15';

interface SenderAction {
  sender_email: string;
  action: RetentionAction;
  unsubscribe: boolean;
}

const BATCH_SIZE = 10;

const Purge = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [senders, setSenders] = useState<SenderSummary[]>([]);
  const [actions, setActions] = useState<Record<string, SenderAction>>({});
  const [emails, setEmails] = useState<Record<string, EmailMetadata[]>>({});
  const [expandedSender, setExpandedSender] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeProgress, setPurgeProgress] = useState(0);
  const [page, setPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!user || !scanId) return;
    const fetchSenders = async () => {
      const { data } = await (supabase as any)
        .from('sender_summary')
        .select('*')
        .eq('scan_id', scanId)
        .eq('user_id', user.id)
        .gte('unopened_percentage', 75)
        .order('total_size_bytes', { ascending: false });

      const s = data || [];
      setSenders(s);

      const defaultActions: Record<string, SenderAction> = {};
      s.forEach((sender) => {
        defaultActions[sender.sender_email] = {
          sender_email: sender.sender_email,
          action: 'skip',
          unsubscribe: false,
        };
      });
      setActions(defaultActions);
      setLoading(false);
    };
    fetchSenders();
  }, [user, scanId]);

  const currentBatch = senders.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE);
  const totalPages = Math.ceil(senders.length / BATCH_SIZE);

  const loadEmails = async (senderEmail: string) => {
    if (emails[senderEmail]) return;
    const { data } = await (supabase as any)
      .from('email_metadata')
      .select('*')
      .eq('scan_id', scanId!)
      .eq('sender_email', senderEmail)
      .order('received_date', { ascending: false })
      .limit(50);
    setEmails((prev) => ({ ...prev, [senderEmail]: data || [] }));
  };

  const updateAction = (senderEmail: string, field: Partial<SenderAction>) => {
    setActions((prev) => ({
      ...prev,
      [senderEmail]: { ...prev[senderEmail], ...field },
    }));
  };

  const estimatedSavings = useMemo(() => {
    let bytes = 0;
    currentBatch.forEach((s) => {
      const action = actions[s.sender_email]?.action;
      if (action === 'delete_all') {
        bytes += s.total_size_bytes;
      } else if (action === 'retain_latest') {
        // Approximate: keep 1, delete rest
        const perEmail = s.total_emails > 0 ? s.total_size_bytes / s.total_emails : 0;
        bytes += s.total_size_bytes - perEmail;
      } else if (action === 'retain_1_in_15') {
        const keep = Math.ceil(s.total_emails / 15);
        const perEmail = s.total_emails > 0 ? s.total_size_bytes / s.total_emails : 0;
        bytes += s.total_size_bytes - perEmail * keep;
      }
    });
    return bytes;
  }, [actions, currentBatch]);

  const actionsToExecute = currentBatch.filter(
    (s) => actions[s.sender_email]?.action !== 'skip' || actions[s.sender_email]?.unsubscribe
  );

  const executePurge = async () => {
    setConfirmOpen(false);
    setPurging(true);
    setPurgeProgress(0);

    const items = actionsToExecute.map((s) => ({
      sender_email: s.sender_email,
      action: actions[s.sender_email].action,
      unsubscribe: actions[s.sender_email].unsubscribe,
    }));

    try {
      const res = await supabase.functions.invoke('purge-emails', {
        body: { scan_id: scanId, senders: items },
      });

      if (res.error) {
        toast.error('Purge failed: ' + (res.error.message || 'Unknown error'));
      } else {
        toast.success(`Purge complete! ${res.data?.mails_deleted || 0} emails trashed.`);
        // Remove purged senders from the list
        const purgedEmails = new Set(items.filter(i => i.action !== 'skip').map(i => i.sender_email));
        setSenders(prev => prev.filter(s => !purgedEmails.has(s.sender_email)));
      }
    } catch {
      toast.error('Purge failed');
    }
    setPurging(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/scan/${scanId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Purge & Unsubscribe</h1>
            <p className="text-sm text-muted-foreground">
              Batch {page + 1} of {totalPages} • Choose actions per sender
            </p>
          </div>
        </div>

        {/* Savings Summary */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-sm font-medium text-primary">Estimated Savings</div>
              <div className="text-2xl font-bold text-foreground">{formatBytes(estimatedSavings)}</div>
            </div>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button disabled={actionsToExecute.length === 0 || purging} size="lg">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Execute Purge ({actionsToExecute.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Confirm Purge
                  </DialogTitle>
                  <DialogDescription>
                    This will move emails from {actionsToExecute.length} sender(s) to Gmail Trash
                    and attempt to unsubscribe where selected. Trashed emails can be recovered within 30 days.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={executePurge}>
                    Confirm Purge
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {purging && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="mb-2 flex justify-between text-sm">
                <span>Purging...</span>
                <span>{purgeProgress}%</span>
              </div>
              <Progress value={purgeProgress} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Sender Cards */}
        <div className="space-y-3">
          {currentBatch.map((sender) => {
            const senderAction = actions[sender.sender_email];
            return (
              <Card key={sender.id}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{sender.sender_name || sender.sender_email}</div>
                      {sender.sender_name && (
                        <div className="text-xs text-muted-foreground">{sender.sender_email}</div>
                      )}
                      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                        <span>{sender.total_emails} emails</span>
                        <span>{formatPercentage(sender.unopened_percentage)} unopened</span>
                        <span>{formatBytes(sender.total_size_bytes)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={senderAction?.action || 'skip'}
                        onValueChange={(v) => updateAction(sender.sender_email, { action: v as RetentionAction })}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Do Not Delete</SelectItem>
                          <SelectItem value="delete_all">Delete All</SelectItem>
                          <SelectItem value="retain_latest">Retain Latest</SelectItem>
                          <SelectItem value="retain_1_in_15">Retain 1 in 15</SelectItem>
                        </SelectContent>
                      </Select>

                      {sender.has_unsubscribe_link && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={senderAction?.unsubscribe || false}
                            onCheckedChange={(v) => updateAction(sender.sender_email, { unsubscribe: v })}
                          />
                          <Label className="text-xs">Unsub</Label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expandable email details */}
                  <Collapsible
                    open={expandedSender === sender.sender_email}
                    onOpenChange={(open) => {
                      setExpandedSender(open ? sender.sender_email : null);
                      if (open) loadEmails(sender.sender_email);
                    }}
                  >
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs">
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedSender === sender.sender_email ? 'rotate-180' : ''}`} />
                        View Emails
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 max-h-48 overflow-auto rounded border bg-muted/30 p-2">
                        {emails[sender.sender_email] ? (
                          emails[sender.sender_email].map((e) => (
                            <div key={e.id} className="flex justify-between border-b border-border/50 py-1.5 text-xs last:border-0">
                              <span className="truncate pr-4">{e.subject || '(no subject)'}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {e.received_date ? formatDate(e.received_date) : '—'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="py-2 text-center text-xs text-muted-foreground">Loading...</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Purge;
