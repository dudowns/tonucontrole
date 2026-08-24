create table public.transactions (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  category_id uuid null,
  type text not null,
  description text not null,
  amount numeric(10, 2) not null,
  date date not null default CURRENT_DATE,
  paid boolean null default true,
  notes text null,
  created_at timestamp with time zone null default now(),
  is_recurring boolean null default false,
  recurrence_type text null,
  installments integer null default 1,
  current_installment integer null default 1,
  is_bill boolean null default false,
  paid_date date null,
  constraint transactions_pkey primary key (id),
  constraint transactions_category_id_fkey foreign KEY (category_id) references categories (id) on delete set null,
  constraint transactions_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint transactions_type_check check (
    (
      type = any (array['income'::text, 'expense'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_transactions_is_bill on public.transactions using btree (is_bill) TABLESPACE pg_default;

create index IF not exists idx_transactions_paid_date on public.transactions using btree (paid_date) TABLESPACE pg_default;

create index IF not exists idx_transactions_date on public.transactions using btree (date) TABLESPACE pg_default;

create index IF not exists idx_transactions_user_id on public.transactions using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_transactions_paid on public.transactions using btree (paid) TABLESPACE pg_default;

create index IF not exists idx_transactions_bill_date on public.transactions using btree (user_id, is_bill, date) TABLESPACE pg_default;