

# Set Up Database Tables, RLS, and Admin Role Trigger

## What This Does
Creates the full backend database structure needed for Gmail Detox to store scan data, email metadata, sender summaries, and manage admin access -- all secured with row-level security.

## Tables to Create

1. **user_roles** -- Stores admin/user roles (separated from other tables for security)
2. **scan_history** -- Records each mailbox scan with summary stats
3. **email_metadata** -- Immutable snapshot of every email found during a scan
4. **sender_summary** -- Pre-computed per-sender stats for fast display

## Security Setup

- Role enum: `admin`, `user`
- `has_role()` security definer function to safely check roles without RLS recursion
- RLS policies on all tables scoping data to `auth.uid()`
- Admin can view scan_history aggregate stats (not email contents)
- Database trigger: when a new user signs in, if their email matches the `ADMIN_EMAIL` secret, they automatically get the `admin` role

## Admin Role Trigger

A trigger on `auth.users` (via a function checking the secret) will auto-assign the admin role to `vssp12345@gmail.com` when they first sign in.

---

## Technical Details

### Migration SQL (single migration)

**Step 1: Role enum and user_roles table**
- `CREATE TYPE public.app_role AS ENUM ('admin', 'user')`
- `CREATE TABLE public.user_roles` with `user_id`, `role`, unique constraint
- RLS: users can read their own roles

**Step 2: has_role() security definer function**
- Used by all RLS policies to check admin status without recursion

**Step 3: scan_history table**
- Columns: `id`, `user_id`, `started_at`, `completed_at`, `status`, `total_senders`, `total_emails`, `deletable_senders`, `deletable_emails`, `senders_deleted`, `mails_deleted`, `space_scanned`, `space_recoverable`, `space_recovered`
- RLS: users see own rows; admins see all rows

**Step 4: email_metadata table**
- Columns: `id`, `scan_id`, `user_id`, `message_id`, `sender`, `subject`, `received_at`, `size_bytes`, `is_read`, `has_unsubscribe`, `unsubscribe_link`, `deleted`
- RLS: users see own rows only (admins cannot access)

**Step 5: sender_summary table**
- Columns: `id`, `scan_id`, `user_id`, `sender`, `total_emails`, `unopened_count`, `unopened_pct`, `total_size`, `has_unsubscribe`, `purge_action`, `unsubscribe_requested`
- RLS: users see own rows only

**Step 6: Auto-assign admin role trigger**
- Function `public.handle_new_user()` checks if the new user's email matches the `ADMIN_EMAIL` secret (accessed via `current_setting('app.settings.admin_email', true)` or a direct secrets lookup)
- Trigger fires on INSERT to `auth.users`

### Code Changes

- Update `useAuth.tsx` to query `user_roles` table for admin status instead of the hardcoded `false`
- Update `AdminRoute` in `ProtectedRoute.tsx` to actually check admin role
- No changes needed to edge functions or other pages at this stage

