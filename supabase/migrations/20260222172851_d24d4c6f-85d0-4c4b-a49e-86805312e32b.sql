
-- Step 1: Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Step 2: has_role() security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Step 3: scan_history table
CREATE TABLE public.scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  total_senders int NOT NULL DEFAULT 0,
  total_emails int NOT NULL DEFAULT 0,
  deletable_senders int NOT NULL DEFAULT 0,
  deletable_emails int NOT NULL DEFAULT 0,
  senders_deleted int NOT NULL DEFAULT 0,
  mails_deleted int NOT NULL DEFAULT 0,
  space_scanned bigint NOT NULL DEFAULT 0,
  space_recoverable bigint NOT NULL DEFAULT 0,
  space_recovered bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scans"
  ON public.scan_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON public.scan_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON public.scan_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all scans"
  ON public.scan_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Step 4: email_metadata table
CREATE TABLE public.email_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  sender text NOT NULL,
  subject text,
  received_at timestamptz,
  size_bytes bigint NOT NULL DEFAULT 0,
  is_read boolean NOT NULL DEFAULT false,
  has_unsubscribe boolean NOT NULL DEFAULT false,
  unsubscribe_link text,
  deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.email_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emails"
  ON public.email_metadata FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emails"
  ON public.email_metadata FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emails"
  ON public.email_metadata FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Step 5: sender_summary table
CREATE TABLE public.sender_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scan_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sender text NOT NULL,
  total_emails int NOT NULL DEFAULT 0,
  unopened_count int NOT NULL DEFAULT 0,
  unopened_pct numeric(5,2) NOT NULL DEFAULT 0,
  total_size bigint NOT NULL DEFAULT 0,
  has_unsubscribe boolean NOT NULL DEFAULT false,
  purge_action text NOT NULL DEFAULT 'keep',
  unsubscribe_requested boolean NOT NULL DEFAULT false
);

ALTER TABLE public.sender_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sender summaries"
  ON public.sender_summary FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sender summaries"
  ON public.sender_summary FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sender summaries"
  ON public.sender_summary FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Step 6: Auto-assign admin role trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_email text;
BEGIN
  -- Read the ADMIN_EMAIL secret from vault
  SELECT decrypted_secret INTO admin_email
  FROM vault.decrypted_secrets
  WHERE name = 'ADMIN_EMAIL'
  LIMIT 1;

  IF NEW.email = admin_email THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX idx_scan_history_user_id ON public.scan_history(user_id);
CREATE INDEX idx_email_metadata_scan_id ON public.email_metadata(scan_id);
CREATE INDEX idx_email_metadata_user_id ON public.email_metadata(user_id);
CREATE INDEX idx_sender_summary_scan_id ON public.sender_summary(scan_id);
CREATE INDEX idx_sender_summary_user_id ON public.sender_summary(user_id);
