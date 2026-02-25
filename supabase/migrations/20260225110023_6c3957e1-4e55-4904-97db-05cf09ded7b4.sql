
-- Table to store user OAuth tokens (Google refresh/access tokens)
CREATE TABLE public.user_oauth_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'google',
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own tokens
CREATE POLICY "Users can view own tokens"
ON public.user_oauth_tokens
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own tokens"
ON public.user_oauth_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update own tokens"
ON public.user_oauth_tokens
FOR UPDATE
USING (auth.uid() = user_id);

-- Service role needs full access for edge functions
-- (service role bypasses RLS by default)
