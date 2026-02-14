

# Gmail Detox — Full Build Plan

## Overview
A SaaS app that scans Gmail inboxes, identifies mostly-unopened senders, and lets users batch-delete and unsubscribe — all from stored scan metadata, never live queries. Gmail-inspired design with a familiar, clean look.

---

## 1. Backend Setup (Lovable Cloud + Supabase)

### Database Tables
- **scan_history** — stores each scan's summary stats (scan_id, user_id, timestamps, counts, space metrics)
- **email_metadata** — immutable snapshot of every email found during scan (message ID, sender, subject, date, size, opened status, unsubscribe link presence)
- **sender_summary** — aggregated per-sender stats per scan (total emails, unopened %, total size, unsubscribe availability)
- **user_roles** — separate roles table for admin access (using `has_role` security definer pattern)

### Row-Level Security
- All tables scoped to `user_id = auth.uid()`
- Admin access via `has_role()` function — admin can see user-level aggregate stats but never email contents
- ADMIN_EMAIL stored as a Supabase secret, used by a trigger to assign admin role on signup

---

## 2. Authentication
- **Google OAuth only** via Supabase Auth
- Request offline access with scopes: `gmail.readonly`, `gmail.modify`, `openid`, `email`, `profile`
- Store OAuth refresh tokens securely server-side (Supabase Auth handles this)
- No email/password option

### Google Cloud Setup Guide (provided in-app + docs)
- Create Google Cloud project → enable Gmail API → configure OAuth consent screen → add scopes → create Web OAuth Client ID → set redirect URL to Supabase callback

---

## 3. Edge Functions

### `scan-mailbox`
- Uses user's Google OAuth token to read full mailbox
- Stores all email metadata as immutable snapshot
- Computes sender summaries
- Sends real-time progress updates via Supabase Realtime (or polling)
- Creates scan_history record with stats

### `purge-emails`
- Reads stored message IDs from email_metadata
- Applies retention rules (delete all, retain latest, retain 1-in-15)
- Moves emails to Gmail Trash via Gmail API (not permanent delete)
- Updates scan_history metrics after each batch
- Removes completed senders from working set

### `unsubscribe`
- Priority: Gmail List-Unsubscribe header → link from latest email body
- Logs success/failure per sender

### `rescan-mailbox`
- Deletes old scan metadata for user
- Triggers fresh full scan

---

## 4. Screens & UI (Gmail-inspired design)

### Login Page
- Simple centered card with "Sign in with Google" button
- Gmail Detox branding and tagline

### Main Dashboard (Scan History)
- Table showing all past scans with columns: Scan time, Senders deleted, Mails deleted, Space recovered, Deletable senders, Deletable mails, Recoverable space
- **Scan Mailbox** button (or **Rescan** if scan exists)
- **View Details** per scan row
- Real-time progress bar during active scan with percentage and status text

### Summary Screen (per scan)
- Filtered to senders with ≥75% unopened emails
- Sorted by total size descending
- Table columns: Sender, Total emails, % Unopened, Total size, Unsubscribe available
- **Purge & Unsubscribe** button to enter purge flow
- **Rescan Mailbox** button

### Purge Screen
- Shows 10 senders per batch
- Per-sender action selector: Do Not Delete / Retain Latest / Retain 1 in 15
- Unsubscribe toggle (if link available)
- **View Details** expandable showing subject + date list
- Dynamic storage savings counter updating as selections change
- **Execute Purge** button with confirmation dialog
- Progress indicator during purge execution

### Admin Panel (admin-only route)
- Accessible only to the user matching ADMIN_EMAIL
- Table: User email, Total scans, Total mails deleted, Last active date
- No access to email contents or metadata

---

## 5. Security
- RLS on all tables — users see only their own data
- Admin role managed via separate `user_roles` table with `has_role()` security definer function
- Admin cannot read email contents (RLS enforced)
- OAuth tokens managed by Supabase Auth (not stored in app tables)
- All destructive actions operate on stored metadata only

---

## 6. Performance
- Full mailbox read only during scan (edge function)
- Batch processing for purge (10 senders at a time)
- Progress indicators for long-running operations
- Sender summaries pre-computed during scan, not on-the-fly

---

## 7. Setup Guide (delivered in README)
- Step-by-step Google Cloud Console setup
- Where to configure secrets in Lovable (Google Client ID, Client Secret, ADMIN_EMAIL)
- How to use the app: Login → Scan → Review → Purge
- Testing checklist covering all flows

