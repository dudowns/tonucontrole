-- ==========================================================================
-- TABELA: portfolio_snapshots (Histórico Diário de Patrimônio)
-- Utilizado pelo Card de Conquistas e Gráficos de Evolução
-- ==========================================================================

create table if not exists public.portfolio_snapshots (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    date date not null default current_date,
    total_value numeric(14, 2) not null default 0.00,
    created_at timestamptz default now() not null,
    constraint unique_portfolio_snapshot_user_date unique (user_id, date)
);

-- Habilita RLS
alter table public.portfolio_snapshots enable row level security;

-- Políticas de acesso
drop policy if exists "Usuários podem visualizar seus próprios snapshots" on public.portfolio_snapshots;
create policy "Usuários podem visualizar seus próprios snapshots"
    on public.portfolio_snapshots for select
    using (auth.uid() = user_id);

drop policy if exists "Usuários podem inserir seus próprios snapshots" on public.portfolio_snapshots;
create policy "Usuários podem inserir seus próprios snapshots"
    on public.portfolio_snapshots for insert
    with check (auth.uid() = user_id);

drop policy if exists "Usuários podem atualizar seus próprios snapshots" on public.portfolio_snapshots;
create policy "Usuários podem atualizar seus próprios snapshots"
    on public.portfolio_snapshots for update
    using (auth.uid() = user_id);

create index if not exists idx_portfolio_snapshots_user_date
    on public.portfolio_snapshots (user_id, date desc);
