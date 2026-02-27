-- 小桌板 Supabase schema (cloud-first)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.workspaces (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  theme text not null default 'light',
  permissions jsonb not null default '{"editable": true, "shareable": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.boards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  layout_mode text not null default 'free',
  zoom double precision not null default 1,
  locked boolean not null default false,
  background jsonb not null default '{"type":"color","value":"#e8ebf0"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.widget_definitions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  type text not null,
  name text not null,
  version integer not null default 1,
  description text null,
  input_schema jsonb not null default '{"fields":[]}'::jsonb,
  output_schema jsonb not null default '{"fields":[]}'::jsonb,
  ui_schema jsonb not null default '{"layout":"single-column"}'::jsonb,
  logic_spec jsonb not null default '{}'::jsonb,
  storage_policy jsonb not null default '{"strategy":"local"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.widget_instances (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  definition_id text not null references public.widget_definitions(id) on delete restrict,
  state jsonb not null default '{}'::jsonb,
  bindings jsonb not null default '[]'::jsonb,
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  size jsonb not null default '{"w":240,"h":180}'::jsonb,
  z_index integer not null default 1,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger trg_boards_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

create trigger trg_widget_definitions_updated_at
before update on public.widget_definitions
for each row execute function public.set_updated_at();

create trigger trg_widget_instances_updated_at
before update on public.widget_instances
for each row execute function public.set_updated_at();

create index if not exists idx_workspaces_user_updated on public.workspaces(user_id, updated_at desc);
create index if not exists idx_workspaces_user_deleted on public.workspaces(user_id, deleted_at);

create index if not exists idx_boards_user_updated on public.boards(user_id, updated_at desc);
create index if not exists idx_boards_user_deleted on public.boards(user_id, deleted_at);
create index if not exists idx_boards_workspace on public.boards(workspace_id);

create index if not exists idx_widget_definitions_user_updated on public.widget_definitions(user_id, updated_at desc);
create index if not exists idx_widget_definitions_user_deleted on public.widget_definitions(user_id, deleted_at);

create index if not exists idx_widget_instances_user_updated on public.widget_instances(user_id, updated_at desc);
create index if not exists idx_widget_instances_user_deleted on public.widget_instances(user_id, deleted_at);
create index if not exists idx_widget_instances_board on public.widget_instances(board_id);
create index if not exists idx_widget_instances_definition on public.widget_instances(definition_id);

alter table public.workspaces enable row level security;
alter table public.boards enable row level security;
alter table public.widget_definitions enable row level security;
alter table public.widget_instances enable row level security;

drop policy if exists workspaces_owner_all on public.workspaces;
create policy workspaces_owner_all on public.workspaces
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists boards_owner_all on public.boards;
create policy boards_owner_all on public.boards
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists widget_definitions_owner_all on public.widget_definitions;
create policy widget_definitions_owner_all on public.widget_definitions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists widget_instances_owner_all on public.widget_instances;
create policy widget_instances_owner_all on public.widget_instances
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
