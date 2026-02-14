
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
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

-- RLS for user_roles: users can read their own roles, admins can read all
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Scan history table
CREATE TABLE public.scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  senders_deleted INTEGER NOT NULL DEFAULT 0,
  mails_deleted INTEGER NOT NULL DEFAULT 0,
  space_recovered BIGINT NOT NULL DEFAULT 0,
  deletable_senders INTEGER NOT NULL DEFAULT 0,
  deletable_mails INTEGER NOT NULL DEFAULT 0,
  recoverable_space BIGINT NOT NULL DEFAULT 0,
  total_emails_scanned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own scans"
  ON public.scan_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own scans"
  ON public.scan_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own scans"
  ON public.scan_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own scans"
  ON public.scan_history FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admin can read scan_history for aggregate stats
CREATE POLICY "Admins can read all scans"
  ON public.scan_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for scan_history (progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_history;

-- Email metadata table
CREATE TABLE public.email_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scan_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  email_id TEXT NOT NULL,
  sender_name TEXT,
  sender_email TEXT NOT NULL,
  subject TEXT,
  received_date TIMESTAMPTZ,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  is_opened BOOLEAN NOT NULL DEFAULT false,
  has_unsubscribe_link BOOLEAN NOT NULL DEFAULT false,
  unsubscribe_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own email metadata"
  ON public.email_metadata FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own email metadata"
  ON public.email_metadata FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own email metadata"
  ON public.email_metadata FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Create index for performance
CREATE INDEX idx_email_metadata_scan_id ON public.email_metadata(scan_id);
CREATE INDEX idx_email_metadata_sender_email ON public.email_metadata(sender_email);

-- Sender summary table
CREATE TABLE public.sender_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scan_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_name TEXT,
  sender_email TEXT NOT NULL,
  total_emails INTEGER NOT NULL DEFAULT 0,
  unopened_count INTEGER NOT NULL DEFAULT 0,
  unopened_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  has_unsubscribe_link BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sender_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sender summaries"
  ON public.sender_summary FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sender summaries"
  ON public.sender_summary FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sender summaries"
  ON public.sender_summary FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_sender_summary_scan_id ON public.sender_summary(scan_id);

-- Function to auto-assign admin role based on ADMIN_EMAIL secret
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_email TEXT;
BEGIN
  -- Get admin email from vault/secrets
  SELECT decrypted_secret INTO admin_email
  FROM vault.decrypted_secrets
  WHERE name = 'ADMIN_EMAIL'
  LIMIT 1;

  IF admin_email IS NOT NULL AND NEW.email = admin_email THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
