-- ========================================================
-- HISTÓRICO DE NOTIFICAÇÕES (NOTIFICATION_LOG)
-- ========================================================

CREATE TABLE IF NOT EXISTS public.notification_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT,
    url TEXT,
    icon TEXT,
    read_at TIMESTAMPTZ DEFAULT NULL,
    dismissed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_user ON public.notification_log(user_id, created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" 
    ON public.notification_log FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" 
    ON public.notification_log FOR UPDATE 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" 
    ON public.notification_log FOR DELETE 
    USING (auth.uid() = user_id);
