create table public.user_stats (
  user_id uuid not null,
  patrimony numeric(12, 2) null default 0,
  updated_at timestamp with time zone null default now(),
  constraint user_stats_pkey primary key (user_id),
  constraint user_stats_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;