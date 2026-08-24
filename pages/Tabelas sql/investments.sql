create table public.investments (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  date date not null,
  type text not null,
  ticker text not null,
  quantity numeric(12, 4) not null,
  unit_price numeric(10, 2) not null,
  total_value numeric(10, 2) not null,
  created_at timestamp with time zone null default now(),
  asset_class text null default 'fiis'::text,
  note text null,
  constraint investments_pkey primary key (id),
  constraint investments_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint investments_type_check check (
    (type = any (array['Compra'::text, 'Venda'::text]))
  )
) TABLESPACE pg_default;