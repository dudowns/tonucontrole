-- ==========================================================================
-- TABELA: corporate_events (Eventos Corporativos B3 / Tesouro / Fundos)
-- Suporte a Desdobramento, Agrupamento, Bonificação, Amortização e Subscrição
-- NOTA DE ARQUITETURA: Proventos em dinheiro (Dividendos, JCP e Rendimentos)
-- residem exclusivamente na tabela `public.dividends`, preservando a separação
-- de responsabilidade entre Fluxo de Caixa/Proventos e Eventos de Custódia/PM.
-- ==========================================================================

create table public.corporate_events (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  ticker text not null,
  event_type text not null, -- 'Desdobramento', 'Agrupamento', 'Bonificação', 'Amortização', 'Subscrição'
  event_date date not null,
  ratio_from numeric(12, 4) not null default 1,         -- Proporção base (Ex: 1)
  ratio_to numeric(12, 4) not null default 1,           -- Proporção resultante (Ex: 10 no split 1:10)
  bonus_shares numeric(12, 4) null default 0,          -- Cotas recebidas (bonificação ou subscrição)
  bonus_unit_cost numeric(10, 4) null default 0,        -- Custo unitário atribuído (ou preço de exercício na subscrição)
  amortization_per_share numeric(10, 4) null default 0, -- Valor amortizado por cota
  note text null,
  created_at timestamp with time zone null default now(),
  constraint corporate_events_pkey primary key (id),
  constraint corporate_events_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint corporate_events_type_check check (
    event_type = any (array[
      'Desdobramento'::text,
      'Agrupamento'::text,
      'Bonificação'::text,
      'Amortização'::text,
      'Subscrição'::text
    ])
  ),
  -- Constraints de Sanidade Numérica
  constraint corporate_events_ratios_positive check (
    ratio_from > 0 and ratio_to > 0
  ),
  constraint corporate_events_bonus_non_negative check (
    (bonus_shares is null or bonus_shares >= 0) and
    (bonus_unit_cost is null or bonus_unit_cost >= 0)
  ),
  constraint corporate_events_amortization_non_negative check (
    amortization_per_share is null or amortization_per_share >= 0
  ),
  -- Prevenção de duplicidade acidental no mesmo dia/tipo/ativo
  constraint corporate_events_user_ticker_date_type_unique unique (user_id, ticker, event_date, event_type)
) tablespace pg_default;

create index if not exists idx_corporate_events_user_id on public.corporate_events using btree (user_id);
create index if not exists idx_corporate_events_ticker on public.corporate_events using btree (ticker);
create index if not exists idx_corporate_events_date on public.corporate_events using btree (event_date);

-- Habilitar RLS (Row Level Security)
alter table public.corporate_events enable row level security;

create policy "Usuários podem visualizar apenas seus próprios eventos corporativos"
  on public.corporate_events for select
  using (auth.uid() = user_id);

create policy "Usuários podem inserir seus próprios eventos corporativos"
  on public.corporate_events for insert
  with check (auth.uid() = user_id);

create policy "Usuários podem atualizar seus próprios eventos corporativos"
  on public.corporate_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Usuários podem excluir seus próprios eventos corporativos"
  on public.corporate_events for delete
  using (auth.uid() = user_id);
