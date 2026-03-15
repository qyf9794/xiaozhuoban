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

create table if not exists public.message_board_messages (
  id text primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gomoku_matches (
  id text primary key,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_user_name text not null,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_name text not null,
  status text not null default 'pending',
  board_state jsonb not null default '[]'::jsonb,
  moves_count integer not null default 0,
  current_turn text not null default 'black',
  winner text null,
  revision integer not null default 0,
  accepted_at timestamptz null,
  finished_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gomoku_matches_status_check check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired')),
  constraint gomoku_matches_turn_check check (current_turn in ('black', 'white')),
  constraint gomoku_matches_winner_check check (winner is null or winner in ('black', 'white', 'draw')),
  constraint gomoku_matches_host_guest_check check (host_user_id <> guest_user_id)
);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_boards_updated_at on public.boards;
create trigger trg_boards_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists trg_widget_definitions_updated_at on public.widget_definitions;
create trigger trg_widget_definitions_updated_at
before update on public.widget_definitions
for each row execute function public.set_updated_at();

drop trigger if exists trg_widget_instances_updated_at on public.widget_instances;
create trigger trg_widget_instances_updated_at
before update on public.widget_instances
for each row execute function public.set_updated_at();

drop trigger if exists trg_gomoku_matches_updated_at on public.gomoku_matches;
create trigger trg_gomoku_matches_updated_at
before update on public.gomoku_matches
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
create index if not exists idx_message_board_messages_created_at on public.message_board_messages(created_at desc);
create index if not exists idx_gomoku_matches_host_status on public.gomoku_matches(host_user_id, status, updated_at desc);
create index if not exists idx_gomoku_matches_guest_status on public.gomoku_matches(guest_user_id, status, updated_at desc);
create index if not exists idx_gomoku_matches_expires on public.gomoku_matches(expires_at);

alter table public.workspaces enable row level security;
alter table public.boards enable row level security;
alter table public.widget_definitions enable row level security;
alter table public.widget_instances enable row level security;
alter table public.message_board_messages enable row level security;
alter table public.gomoku_matches enable row level security;

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

drop policy if exists message_board_messages_auth_select on public.message_board_messages;
create policy message_board_messages_auth_select on public.message_board_messages
for select
to authenticated
using (true);

drop policy if exists message_board_messages_auth_insert on public.message_board_messages;
create policy message_board_messages_auth_insert on public.message_board_messages
for insert
to authenticated
with check (auth.uid() = sender_id);

drop policy if exists gomoku_matches_players_select on public.gomoku_matches;
create policy gomoku_matches_players_select on public.gomoku_matches
for select
to authenticated
using (auth.uid() = host_user_id or auth.uid() = guest_user_id);

drop policy if exists gomoku_matches_host_insert on public.gomoku_matches;
create policy gomoku_matches_host_insert on public.gomoku_matches
for insert
to authenticated
with check (auth.uid() = host_user_id);

drop policy if exists gomoku_matches_players_update on public.gomoku_matches;
create policy gomoku_matches_players_update on public.gomoku_matches
for update
to authenticated
using (auth.uid() = host_user_id or auth.uid() = guest_user_id)
with check (auth.uid() = host_user_id or auth.uid() = guest_user_id);
