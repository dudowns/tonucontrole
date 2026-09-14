create table public.dividends (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  ticker text not null,
  type text not null,
  quantity numeric(10, 4) not null,
  unit_value numeric(10, 4) not null,
  total_value numeric(10, 2) not null,
  net_value numeric(10, 2) null,
  date date not null,
  date_com date null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  note text null,
  constraint dividends_pkey primary key (id),
  constraint dividends_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint dividends_type_check check (
    (
      type = any (
        array[
          'Dividendo'::text,
          'JCP'::text,
          'Rendimento'::text,
          'Bonificação'::text
        ]
      )
    )
  ),
  constraint dividends_total_value_check check (
    abs(total_value - (quantity * unit_value)) <= 0.01
  ),
  constraint dividends_user_ticker_date_type_unique unique (user_id, ticker, date, type)
) TABLESPACE pg_default;

create index IF not exists idx_dividends_user_id on public.dividends using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_dividends_ticker on public.dividends using btree (ticker) TABLESPACE pg_default;

create index IF not exists idx_dividends_date on public.dividends using btree (date) TABLESPACE pg_default;

create trigger dividends_updated_at BEFORE
update on dividends for EACH row
execute FUNCTION update_dividends_updated_at ();