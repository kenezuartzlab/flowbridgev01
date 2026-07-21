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

  INSERT INTO public.profiles (
    id,
    email,
    referral_code,
    flow_points,
    points_self
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    new_code,
    50,
    50
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET
  flow_points = 50,
  points_self = 50
WHERE COALESCE(flow_points, 0) = 0
  AND COALESCE(points_self, 0) = 0
  AND COALESCE(points_referral_activity, 0) = 0
  AND COALESCE(points_referral_signup, 0) = 0
  AND COALESCE(claimed_tokens, 0) = 0;