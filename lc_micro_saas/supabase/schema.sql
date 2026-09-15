-- =========================================================
-- LC COMMERCE - SUPABASE DATABASE
-- Execute este arquivo UMA VEZ no SQL Editor do Supabase.
-- =========================================================

create extension if not exists pgcrypto;

-- -----------------------------
-- Helpers
-- -----------------------------
create or replace function public.slugify(input_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(input_text,''),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    )),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

-- -----------------------------
-- Tables
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  whatsapp text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'Produtos',
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  cep text not null,
  address text not null,
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'pending'
    check (status in ('pending','confirmed','shipped','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create index if not exists products_store_id_idx on public.products(store_id);
create index if not exists orders_store_id_idx on public.orders(store_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- -----------------------------
-- updated_at helper
-- -----------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- -----------------------------
-- Auto create profile + store
-- -----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  final_slug text;
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  base_slug := public.slugify(
    coalesce(new.raw_user_meta_data ->> 'store_name', 'minha-loja')
  );

  if base_slug = '' then
    base_slug := 'minha-loja';
  end if;

  final_slug := base_slug || '-' || substring(new.id::text, 1, 6);

  insert into public.stores (owner_id, name, whatsapp, slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'store_name', 'Minha Loja'),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    final_slug
  )
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() is not null and id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() is not null and id = auth.uid())
with check (auth.uid() is not null and id = auth.uid());

-- Public storefront needs to read public store data.
drop policy if exists "stores_public_read" on public.stores;
create policy "stores_public_read"
on public.stores for select
to anon, authenticated
using (true);

drop policy if exists "stores_owner_update" on public.stores;
create policy "stores_owner_update"
on public.stores for update
to authenticated
using (auth.uid() is not null and owner_id = auth.uid())
with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active"
on public.products for select
to anon
using (active = true);

drop policy if exists "products_auth_read" on public.products;
create policy "products_auth_read"
on public.products for select
to authenticated
using (
  active = true
  or exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_insert" on public.products;
create policy "products_owner_insert"
on public.products for insert
to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_update" on public.products;
create policy "products_owner_update"
on public.products for update
to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_delete" on public.products;
create policy "products_owner_delete"
on public.products for delete
to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "orders_owner_read" on public.orders;
create policy "orders_owner_read"
on public.orders for select
to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = orders.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "orders_owner_update" on public.orders;
create policy "orders_owner_update"
on public.orders for update
to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = orders.store_id and s.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id = orders.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "order_items_owner_read" on public.order_items;
create policy "order_items_owner_read"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.stores s on s.id = o.store_id
    where o.id = order_items.order_id
      and s.owner_id = auth.uid()
  )
);

-- -----------------------------
-- Public order RPC
-- The browser sends only product IDs + quantities.
-- Prices are calculated inside Postgres to prevent tampering.
-- -----------------------------
create or replace function public.create_public_order(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_cep text,
  p_address text,
  p_items jsonb
)
returns table(order_id uuid, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_order_id uuid;
  total_value numeric(12,2) := 0;
  item jsonb;
  product_record public.products%rowtype;
  item_qty integer;
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Nome do cliente inválido';
  end if;

  if p_customer_phone is null or length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 10 then
    raise exception 'Telefone inválido';
  end if;

  if p_cep is null or length(regexp_replace(p_cep, '\D', '', 'g')) <> 8 then
    raise exception 'CEP inválido';
  end if;

  if p_address is null or length(trim(p_address)) < 5 then
    raise exception 'Endereço inválido';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;

  if not exists(select 1 from public.stores where id = p_store_id) then
    raise exception 'Loja inválida';
  end if;

  -- First pass: calculate trusted total.
  for item in select * from jsonb_array_elements(p_items)
  loop
    item_qty := greatest(1, (item ->> 'quantity')::integer);

    select *
      into product_record
    from public.products
    where id = (item ->> 'product_id')::uuid
      and store_id = p_store_id
      and active = true;

    if not found then
      raise exception 'Produto inválido ou indisponível';
    end if;

    if product_record.stock > 0 and item_qty > product_record.stock then
      raise exception 'Quantidade indisponível para %', product_record.name;
    end if;

    total_value := total_value + (product_record.price * item_qty);
  end loop;

  insert into public.orders (
    store_id,
    customer_name,
    customer_phone,
    cep,
    address,
    total,
    status
  )
  values (
    p_store_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_cep),
    trim(p_address),
    total_value,
    'pending'
  )
  returning id into new_order_id;

  -- Second pass: snapshots the purchased products.
  for item in select * from jsonb_array_elements(p_items)
  loop
    item_qty := greatest(1, (item ->> 'quantity')::integer);

    select *
      into product_record
    from public.products
    where id = (item ->> 'product_id')::uuid
      and store_id = p_store_id
      and active = true;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal
    )
    values (
      new_order_id,
      product_record.id,
      product_record.name,
      item_qty,
      product_record.price,
      product_record.price * item_qty
    );

    -- Stock 0 is treated as "unlimited/not controlled" in this MVP.
    if product_record.stock > 0 then
      update public.products
      set stock = greatest(0, stock - item_qty)
      where id = product_record.id;
    end if;
  end loop;

  return query select new_order_id, total_value;
end;
$$;

-- -----------------------------
-- Storage bucket
-- -----------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "product_images_owner_insert" on storage.objects;
create policy "product_images_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product_images_owner_update" on storage.objects;
create policy "product_images_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product_images_owner_delete" on storage.objects;
create policy "product_images_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------
-- Grants for the Data API
-- -----------------------------
grant usage on schema public to anon, authenticated;

grant select on public.stores to anon, authenticated;
grant select on public.products to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant update on public.stores to authenticated;
grant insert, update, delete on public.products to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

revoke all on function public.create_public_order(uuid,text,text,text,text,jsonb) from public;
grant execute on function public.create_public_order(uuid,text,text,text,text,jsonb) to anon, authenticated;
