create table public.categories (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text not null,
  type text not null,
  icon text null default 'fa-tag'::text,
  color text null default '#6C5CE7'::text,
  created_at timestamp with time zone null default now(),
  constraint categories_pkey primary key (id),
  constraint categories_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint categories_type_check check (
    (
      type = any (array['income'::text, 'expense'::text])
    )
  )
) TABLESPACE pg_default;