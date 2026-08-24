create table public.monthly_budgets (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  category_id uuid null,
  month integer not null,
  year integer not null,
  budget_limit numeric(10, 2) not null,
  created_at timestamp with time zone null default now(),
  constraint monthly_budgets_pkey primary key (id),
  constraint monthly_budgets_category_id_fkey foreign KEY (category_id) references categories (id) on delete CASCADE,
  constraint monthly_budgets_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;