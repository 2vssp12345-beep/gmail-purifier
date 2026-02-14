import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';

interface AdminUser {
  user_id: string;
  email: string;
  total_scans: number;
  total_mails_deleted: number;
  last_active: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      // Admin can see all scan_history rows via RLS admin policy
      const { data, error } = await supabase
        .from('scan_history')
        .select('user_id, mails_deleted, started_at')
        .order('started_at', { ascending: false });

      if (error) {
        toast.error('Failed to load admin data');
        setLoading(false);
        return;
      }

      // Aggregate per user
      const userMap = new Map<string, AdminUser>();
      (data || []).forEach((row) => {
        const existing = userMap.get(row.user_id);
        if (existing) {
          existing.total_scans++;
          existing.total_mails_deleted += row.mails_deleted;
          if (row.started_at > existing.last_active) {
            existing.last_active = row.started_at;
          }
        } else {
          userMap.set(row.user_id, {
            user_id: row.user_id,
            email: row.user_id, // Will be resolved below
            total_scans: 1,
            total_mails_deleted: row.mails_deleted,
            last_active: row.started_at,
          });
        }
      });

      setUsers(Array.from(userMap.values()));
      setLoading(false);
    };
    fetchUsers();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">User activity overview (no email content access)</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{users.length} User{users.length !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Total Scans</TableHead>
                    <TableHead className="text-right">Total Mails Deleted</TableHead>
                    <TableHead className="text-right">Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-mono text-xs">{u.user_id}</TableCell>
                      <TableCell className="text-right">{u.total_scans}</TableCell>
                      <TableCell className="text-right">{u.total_mails_deleted}</TableCell>
                      <TableCell className="text-right">{formatDate(u.last_active)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
