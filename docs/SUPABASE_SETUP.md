### `ping` Table

This table records health check pings to keep the Supabase project active and prevent free tier auto-pause.

```sql
-- Create ping table
CREATE TABLE IF NOT EXISTS public.ping (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  http_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'github_actions' NOT NULL
);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_ping_created_at
  ON public.ping (created_at DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_ping_status
  ON public.ping (status);

-- Enable Row Level Security
ALTER TABLE public.ping ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to insert
CREATE POLICY "Allow service role to insert"
  ON public.ping
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow service role to select
CREATE POLICY "Allow service role to select"
  ON public.ping
  FOR SELECT
  USING (true);
```