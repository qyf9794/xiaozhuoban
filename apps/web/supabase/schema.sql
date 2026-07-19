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

create table if not exists public.assistant_command_logs (
  id text primary key,
  operation_id text null,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text null references public.boards(id) on delete set null,
  route text not null,
  source_mode text not null,
  transcript text null,
  normalized text null,
  candidate_modules jsonb null,
  selected_module text null,
  selected_tool_hint text null,
  selection_confidence double precision null,
  learning_candidate boolean not null default false,
  tool_name text null,
  sanitized_args jsonb null,
  target_widget jsonb null,
  result_status text not null,
  result_message text not null,
  error_code text null,
  confirmation_state text null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.assistant_command_logs add column if not exists operation_id text null;
alter table public.assistant_command_logs add column if not exists normalized text null;
alter table public.assistant_command_logs add column if not exists candidate_modules jsonb null;
alter table public.assistant_command_logs add column if not exists selected_module text null;
alter table public.assistant_command_logs add column if not exists selected_tool_hint text null;
alter table public.assistant_command_logs add column if not exists selection_confidence double precision null;
alter table public.assistant_command_logs add column if not exists learning_candidate boolean not null default false;

create table if not exists public.gomoku_matches (
  id text primary key,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_user_name text not null,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_name text not null,
  status text not null default 'pending',
  round_state text not null default 'playing',
  board_state jsonb not null default '[]'::jsonb,
  moves_count integer not null default 0,
  current_turn text not null default 'black',
  winner text null,
  series_winner text null,
  current_round integer not null default 1,
  host_wins integer not null default 0,
  guest_wins integer not null default 0,
  draw_count integer not null default 0,
  black_user_id uuid null references auth.users(id) on delete cascade,
  white_user_id uuid null references auth.users(id) on delete cascade,
  rematch_host_confirmed boolean not null default false,
  rematch_guest_confirmed boolean not null default false,
  revision integer not null default 0,
  accepted_at timestamptz null,
  finished_at timestamptz null,
  round_finished_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gomoku_matches_status_check check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired')),
  constraint gomoku_matches_round_state_check check (round_state in ('playing', 'round_complete', 'series_complete')),
  constraint gomoku_matches_turn_check check (current_turn in ('black', 'white')),
  constraint gomoku_matches_winner_check check (winner is null or winner in ('black', 'white', 'draw')),
  constraint gomoku_matches_series_winner_check check (series_winner is null or series_winner in ('host', 'guest')),
  constraint gomoku_matches_host_guest_check check (host_user_id <> guest_user_id)
);

create table if not exists public.monopoly_matches (
  id text primary key,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_user_name text not null,
  participant_ids text[] not null default '{}',
  status text not null default 'pending',
  phase text not null default 'lobby',
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monopoly_matches_status_check check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired')),
  constraint monopoly_matches_phase_check check (phase in ('lobby', 'await_roll', 'await_purchase_decision', 'resolving_card', 'completed')),
  constraint monopoly_matches_participants_check check (
    coalesce(array_length(participant_ids, 1), 0) >= 2
    and coalesce(array_length(participant_ids, 1), 0) <= 4
    and host_user_id::text = any(participant_ids)
  )
);

create table if not exists public.guandan_matches (
  id text primary key,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_user_name text not null,
  participant_ids text[] not null default '{}',
  status text not null default 'pending',
  phase text not null default 'lobby',
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guandan_matches_status_check check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired')),
  constraint guandan_matches_phase_check check (phase in ('lobby', 'tribute', 'playing', 'round_complete', 'match_complete')),
  constraint guandan_matches_participants_check check (
    coalesce(array_length(participant_ids, 1), 0) = 4
    and host_user_id::text = any(participant_ids)
  )
);

alter table public.gomoku_matches add column if not exists round_state text not null default 'playing';
alter table public.gomoku_matches add column if not exists series_winner text null;
alter table public.gomoku_matches add column if not exists current_round integer not null default 1;
alter table public.gomoku_matches add column if not exists host_wins integer not null default 0;
alter table public.gomoku_matches add column if not exists guest_wins integer not null default 0;
alter table public.gomoku_matches add column if not exists draw_count integer not null default 0;
alter table public.gomoku_matches add column if not exists black_user_id uuid null references auth.users(id) on delete cascade;
alter table public.gomoku_matches add column if not exists white_user_id uuid null references auth.users(id) on delete cascade;
alter table public.gomoku_matches add column if not exists rematch_host_confirmed boolean not null default false;
alter table public.gomoku_matches add column if not exists rematch_guest_confirmed boolean not null default false;
alter table public.gomoku_matches add column if not exists round_finished_at timestamptz null;

alter table public.monopoly_matches add column if not exists participant_ids text[] not null default '{}';
alter table public.monopoly_matches add column if not exists phase text not null default 'lobby';
alter table public.monopoly_matches add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.monopoly_matches add column if not exists revision integer not null default 0;
alter table public.monopoly_matches add column if not exists started_at timestamptz null;
alter table public.monopoly_matches add column if not exists finished_at timestamptz null;
alter table public.monopoly_matches add column if not exists expires_at timestamptz null;
alter table public.monopoly_matches drop constraint if exists monopoly_matches_status_check;
alter table public.monopoly_matches add constraint monopoly_matches_status_check
check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired'));
alter table public.monopoly_matches drop constraint if exists monopoly_matches_phase_check;
alter table public.monopoly_matches add constraint monopoly_matches_phase_check
check (phase in ('lobby', 'await_roll', 'await_purchase_decision', 'resolving_card', 'completed'));
alter table public.monopoly_matches drop constraint if exists monopoly_matches_participants_check;
alter table public.monopoly_matches add constraint monopoly_matches_participants_check
check (
  coalesce(array_length(participant_ids, 1), 0) >= 2
  and coalesce(array_length(participant_ids, 1), 0) <= 4
  and host_user_id::text = any(participant_ids)
);

alter table public.guandan_matches add column if not exists participant_ids text[] not null default '{}';
alter table public.guandan_matches add column if not exists phase text not null default 'lobby';
alter table public.guandan_matches add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.guandan_matches add column if not exists revision integer not null default 0;
alter table public.guandan_matches add column if not exists started_at timestamptz null;
alter table public.guandan_matches add column if not exists finished_at timestamptz null;
alter table public.guandan_matches add column if not exists expires_at timestamptz null;
alter table public.guandan_matches drop constraint if exists guandan_matches_status_check;
alter table public.guandan_matches add constraint guandan_matches_status_check
check (status in ('pending', 'active', 'declined', 'cancelled', 'completed', 'expired'));
alter table public.guandan_matches drop constraint if exists guandan_matches_phase_check;
alter table public.guandan_matches add constraint guandan_matches_phase_check
check (phase in ('lobby', 'tribute', 'playing', 'round_complete', 'match_complete'));
alter table public.guandan_matches drop constraint if exists guandan_matches_participants_check;
alter table public.guandan_matches add constraint guandan_matches_participants_check
check (
  coalesce(array_length(participant_ids, 1), 0) = 4
  and host_user_id::text = any(participant_ids)
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

drop trigger if exists trg_monopoly_matches_updated_at on public.monopoly_matches;
create trigger trg_monopoly_matches_updated_at
before update on public.monopoly_matches
for each row execute function public.set_updated_at();

drop trigger if exists trg_guandan_matches_updated_at on public.guandan_matches;
create trigger trg_guandan_matches_updated_at
before update on public.guandan_matches
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
create index if not exists idx_assistant_command_logs_user_created on public.assistant_command_logs(user_id, created_at desc);
create index if not exists idx_assistant_command_logs_board_created on public.assistant_command_logs(board_id, created_at desc);
create index if not exists idx_gomoku_matches_host_status on public.gomoku_matches(host_user_id, status, updated_at desc);
create index if not exists idx_gomoku_matches_guest_status on public.gomoku_matches(guest_user_id, status, updated_at desc);
create index if not exists idx_gomoku_matches_expires on public.gomoku_matches(expires_at);
create index if not exists idx_monopoly_matches_host_status on public.monopoly_matches(host_user_id, status, updated_at desc);
create index if not exists idx_monopoly_matches_expires on public.monopoly_matches(expires_at);
create index if not exists idx_monopoly_matches_participants on public.monopoly_matches using gin(participant_ids);
create index if not exists idx_guandan_matches_host_status on public.guandan_matches(host_user_id, status, updated_at desc);
create index if not exists idx_guandan_matches_expires on public.guandan_matches(expires_at);
create index if not exists idx_guandan_matches_participants on public.guandan_matches using gin(participant_ids);

alter table public.workspaces enable row level security;
alter table public.boards enable row level security;
alter table public.widget_definitions enable row level security;
alter table public.widget_instances enable row level security;
alter table public.message_board_messages enable row level security;
alter table public.assistant_command_logs enable row level security;
alter table public.gomoku_matches enable row level security;
alter table public.monopoly_matches enable row level security;
alter table public.guandan_matches enable row level security;

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
drop policy if exists message_board_messages_board_select on public.message_board_messages;
create policy message_board_messages_auth_select on public.message_board_messages
for select
to authenticated
using (true);

drop policy if exists message_board_messages_auth_insert on public.message_board_messages;
drop policy if exists message_board_messages_board_insert on public.message_board_messages;
create policy message_board_messages_auth_insert on public.message_board_messages
for insert
to authenticated
with check (auth.uid() = sender_id);

create or replace function public.soft_delete_board(p_board_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.widget_instances
  set deleted_at = now(), updated_at = now()
  where board_id = p_board_id
    and user_id = auth.uid()
    and deleted_at is null;

  update public.boards
  set deleted_at = now(), updated_at = now()
  where id = p_board_id
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_board(text) to authenticated;

drop policy if exists assistant_command_logs_owner_select on public.assistant_command_logs;
create policy assistant_command_logs_owner_select on public.assistant_command_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists assistant_command_logs_owner_insert on public.assistant_command_logs;
create policy assistant_command_logs_owner_insert on public.assistant_command_logs
for insert
to authenticated
with check (auth.uid() = user_id);

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

drop policy if exists monopoly_matches_players_select on public.monopoly_matches;
create policy monopoly_matches_players_select on public.monopoly_matches
for select
to authenticated
using (auth.uid()::text = any(participant_ids));

drop policy if exists monopoly_matches_host_insert on public.monopoly_matches;
create policy monopoly_matches_host_insert on public.monopoly_matches
for insert
to authenticated
with check (auth.uid() = host_user_id and auth.uid()::text = any(participant_ids));

drop policy if exists monopoly_matches_players_update on public.monopoly_matches;
create policy monopoly_matches_players_update on public.monopoly_matches
for update
to authenticated
using (auth.uid()::text = any(participant_ids))
with check (auth.uid()::text = any(participant_ids));

drop policy if exists guandan_matches_players_select on public.guandan_matches;
create policy guandan_matches_players_select on public.guandan_matches
for select
to authenticated
using (auth.uid()::text = any(participant_ids));

drop policy if exists guandan_matches_host_insert on public.guandan_matches;
create policy guandan_matches_host_insert on public.guandan_matches
for insert
to authenticated
with check (auth.uid() = host_user_id and auth.uid()::text = any(participant_ids));

drop policy if exists guandan_matches_players_update on public.guandan_matches;
create policy guandan_matches_players_update on public.guandan_matches
for update
to authenticated
using (auth.uid()::text = any(participant_ids))
with check (auth.uid()::text = any(participant_ids));
-- Integrated Discuz workbench schema. Keep in sync with add_integrated_workbench migration.
-- Integrated Discuz workbench: additive, user-owned, and disabled until feature flags are enabled.
create table if not exists public.workbench_topics (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text null references public.boards(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  summary text null,
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.workbench_files (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  role text not null default 'primary' check (role in ('primary', 'context', 'generated')),
  name text not null check (char_length(name) between 1 and 240),
  mime_type text null,
  storage_path text null,
  extracted_text text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete cascade
);

create table if not exists public.workbench_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  title text not null default '笔记',
  content text not null default '',
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete cascade
);

create table if not exists public.workbench_directions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  text text not null check (char_length(text) between 1 and 4000),
  completed boolean not null default false,
  sort_order integer not null default 0,
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete cascade
);

create table if not exists public.workbench_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete cascade
);

create table if not exists public.workbench_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  title text not null default '讨论记录',
  content text not null default '',
  import_batch_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete cascade
);

create table if not exists public.workbench_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text null,
  prompt text not null check (char_length(prompt) between 1 and 12000),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'response_ready', 'executing', 'awaiting_confirmation', 'succeeded', 'failed', 'cancelled')),
  response_id text null unique,
  reply text null,
  result jsonb null,
  error text null,
  unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.workbench_topics(id, user_id) on delete set null (topic_id)
);

create table if not exists public.workbench_ui_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 160),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.workbench_webhook_events (
  id text primary key,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workbench_command_executions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.workbench_tasks(id) on delete cascade,
  command_type text not null,
  idempotency_key text not null,
  args jsonb not null default '{}'::jsonb,
  status text not null check (status in ('succeeded', 'failed')),
  error text null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.workbench_import_batches (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'discuz',
  status text not null check (status in ('running', 'succeeded', 'failed', 'rolled_back')),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_workbench_topics_user_updated on public.workbench_topics(user_id, updated_at desc);
create index if not exists idx_workbench_topics_board on public.workbench_topics(board_id);
create index if not exists idx_workbench_files_user_topic on public.workbench_files(user_id, topic_id, role, updated_at desc);
create index if not exists idx_workbench_directions_user_topic on public.workbench_directions(user_id, topic_id, sort_order);
create index if not exists idx_workbench_notes_user_topic on public.workbench_notes(user_id, topic_id, updated_at desc);
create index if not exists idx_workbench_messages_user_topic on public.workbench_messages(user_id, topic_id, sort_order);
create index if not exists idx_workbench_records_user_topic on public.workbench_records(user_id, topic_id, updated_at desc);
create index if not exists idx_workbench_tasks_user_status on public.workbench_tasks(user_id, status, updated_at desc);
create index if not exists idx_workbench_tasks_recovery on public.workbench_tasks(status, updated_at);
create index if not exists idx_workbench_command_task on public.workbench_command_executions(task_id);
create index if not exists idx_workbench_import_user on public.workbench_import_batches(user_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workbench_topics',
    'workbench_files',
    'workbench_notes',
    'workbench_directions',
    'workbench_messages',
    'workbench_records',
    'workbench_tasks',
    'workbench_ui_state'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

alter table public.workbench_topics enable row level security;
alter table public.workbench_files enable row level security;
alter table public.workbench_notes enable row level security;
alter table public.workbench_directions enable row level security;
alter table public.workbench_messages enable row level security;
alter table public.workbench_records enable row level security;
alter table public.workbench_tasks enable row level security;
alter table public.workbench_ui_state enable row level security;
alter table public.workbench_webhook_events enable row level security;
alter table public.workbench_command_executions enable row level security;
alter table public.workbench_import_batches enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workbench_topics',
    'workbench_files',
    'workbench_notes',
    'workbench_directions',
    'workbench_messages',
    'workbench_records',
    'workbench_ui_state'
  ]
  loop
    execute format('drop policy if exists %I_owner_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_owner_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_owner_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_owner_delete on public.%I', table_name, table_name);
    execute format(
      'create policy %I_owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
  end loop;
end
$$;

drop policy if exists workbench_topics_owner_insert on public.workbench_topics;
create policy workbench_topics_owner_insert on public.workbench_topics
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    board_id is null
    or exists (
      select 1 from public.boards
      where boards.id = workbench_topics.board_id
        and boards.user_id = (select auth.uid())
    )
  )
);

drop policy if exists workbench_topics_owner_update on public.workbench_topics;
create policy workbench_topics_owner_update on public.workbench_topics
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    board_id is null
    or exists (
      select 1 from public.boards
      where boards.id = workbench_topics.board_id
        and boards.user_id = (select auth.uid())
    )
  )
);

drop policy if exists workbench_import_batches_owner_select on public.workbench_import_batches;
create policy workbench_import_batches_owner_select on public.workbench_import_batches
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists workbench_tasks_owner_select on public.workbench_tasks;
create policy workbench_tasks_owner_select on public.workbench_tasks
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists workbench_tasks_owner_mark_read on public.workbench_tasks;
create policy workbench_tasks_owner_mark_read on public.workbench_tasks
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists workbench_command_executions_owner_select on public.workbench_command_executions;
create policy workbench_command_executions_owner_select on public.workbench_command_executions
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table
  public.workbench_topics,
  public.workbench_files,
  public.workbench_notes,
  public.workbench_directions,
  public.workbench_messages,
  public.workbench_records,
  public.workbench_tasks,
  public.workbench_ui_state,
  public.workbench_webhook_events,
  public.workbench_command_executions,
  public.workbench_import_batches
from anon, authenticated;

grant select, insert, update, delete on table
  public.workbench_topics,
  public.workbench_files,
  public.workbench_notes,
  public.workbench_directions,
  public.workbench_messages,
  public.workbench_records,
  public.workbench_ui_state
to authenticated;

grant select on table public.workbench_tasks, public.workbench_command_executions to authenticated;
grant select on table public.workbench_import_batches to authenticated;
grant update (unread) on table public.workbench_tasks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workbench-files',
  'workbench-files',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain','text/markdown','text/csv','application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workbench_files_owner_select on storage.objects;
create policy workbench_files_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'workbench-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists workbench_files_owner_insert on storage.objects;
create policy workbench_files_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'workbench-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists workbench_files_owner_update on storage.objects;
create policy workbench_files_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'workbench-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'workbench-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists workbench_files_owner_delete on storage.objects;
create policy workbench_files_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'workbench-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workbench_tasks'
  ) then
    alter publication supabase_realtime add table public.workbench_tasks;
  end if;
end
$$;
