
-- profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  flow_points INTEGER NOT NULL DEFAULT 0,
  claimed_tokens INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  wallet_address TEXT,
  last_binding_change TIMESTAMPTZ,
  binding_changes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- transactions_history
CREATE TABLE public.transactions_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tx_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_amount TEXT NOT NULL,
  to_amount TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.transactions_history TO authenticated;
GRANT ALL ON public.transactions_history TO service_role;

ALTER TABLE public.transactions_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_created ON public.transactions_history(user_id, created_at DESC);

-- proposals (community feedback)
CREATE TABLE public.proposals (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL DEFAULT 'Anonymous Supporter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.proposals TO anon;
GRANT SELECT, INSERT, UPDATE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposals are public readable"
  ON public.proposals FOR SELECT
  USING (true);

CREATE POLICY "Anyone authenticated can insert proposals"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone authenticated can upvote proposals"
  ON public.proposals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-create profile on signup with referral code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  i INT;
BEGIN
  new_code := 'FB-';
  FOR i IN 1..5 LOOP
    new_code := new_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;

  INSERT INTO public.profiles (id, email, referral_code)
  VALUES (NEW.id, COALESCE(NEW.email, ''), new_code)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
