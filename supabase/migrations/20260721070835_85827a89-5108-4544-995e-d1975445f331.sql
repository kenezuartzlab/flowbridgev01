
ALTER TABLE public.social_follows
  ADD COLUMN IF NOT EXISTS youtube_handle text,
  ADD COLUMN IF NOT EXISTS x_handle text,
  ADD COLUMN IF NOT EXISTS telegram_handle text;
