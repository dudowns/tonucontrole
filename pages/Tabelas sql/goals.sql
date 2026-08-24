create table public.goals (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  title text not null,
  target_amount numeric(12, 2) not null default 0,
  current_amount numeric(12, 2) not null default 0,
  deadline date null,
  color text null default '#6C5CE7'::text,
  completed boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint goals_pkey primary key (id),
  constraint goals_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists goals_user_id_idx on public.goals using btree (user_id) TABLESPACE pg_default;

create index IF not exists goals_completed_idx on public.goals using btree (completed) TABLESPACE pg_default;