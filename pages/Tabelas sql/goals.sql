create table public.goals (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  title text not null,
  target_amount numeric(12, 2) not null default 0,
  current_amount numeric(12, 2) not null default 0,
  deadline date null,
  color text null default '#6C5CE7'::text,
  completed boolean null default false,
  cdi_percent numeric(5, 2) null default 100.00,
  milestones_fired jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint goals_pkey primary key (id),
  constraint goals_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists goals_user_id_idx on public.goals using btree (user_id) TABLESPACE pg_default;

create index IF not exists goals_completed_idx on public.goals using btree (completed) TABLESPACE pg_default;

-- ATUALIZAÇÃO / MIGRAÇÃO SEGURA PARA GOALS:
ALTER TABLE public.goals 
  ADD COLUMN IF NOT EXISTS cdi_percent numeric(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS milestones_fired jsonb DEFAULT '[]'::jsonb;

-- TABELA: goal_deposits (Histórico de Aportes/Depósitos na Meta)
create table if not exists public.goal_deposits (
  id uuid not null default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null,
  deposit_date date not null default current_date,
  created_at timestamp with time zone null default now(),
  constraint goal_deposits_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_goal_deposits_goal on public.goal_deposits (goal_id, deposit_date desc);
create index if not exists idx_goal_deposits_user on public.goal_deposits (user_id);

alter table public.goal_deposits enable row level security;
create policy "Usuários podem gerenciar seus próprios aportes" on public.goal_deposits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TABELA: goal_yields (Registro Diário/Periódico de Rendimentos por Aporte)
create table if not exists public.goal_yields (
  id uuid not null default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deposit_id uuid null references public.goal_deposits(id) on delete set null,
  gross_yield numeric(12, 2) not null default 0,
  iof_tax numeric(12, 2) not null default 0,
  ir_tax numeric(12, 2) not null default 0,
  net_yield numeric(12, 2) not null default 0,
  reference_date date not null default current_date,
  created_at timestamp with time zone null default now(),
  constraint goal_yields_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_goal_yields_goal on public.goal_yields (goal_id, reference_date desc);
create index if not exists idx_goal_yields_user on public.goal_yields (user_id);

alter table public.goal_yields enable row level security;
create policy "Usuários podem gerenciar seus próprios rendimentos" on public.goal_yields
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);