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
