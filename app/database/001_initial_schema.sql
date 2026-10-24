begin;

-- 1. 房间
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[0-9]{6}$'),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  current_result text
    check (char_length(current_result) between 1 and 60),
  created_at timestamptz not null default now()
);

-- 2. 房间成员
create table public.members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.rooms(id) on delete cascade,
  nickname text not null
    check (char_length(btrim(nickname)) between 1 and 20),
  role text not null default 'member'
    check (role in ('host', 'member')),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (room_id, id)
);

-- 一个房间最多只能有一位房主
create unique index members_one_host_per_room
  on public.members (room_id)
  where role = 'host';

-- 3. 食物或餐馆候选
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.rooms(id) on delete cascade,
  submitted_by uuid not null,
  name text not null
    check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (room_id, name),
  foreign key (room_id, submitted_by)
    references public.members(room_id, id)
    on delete cascade
);

-- 4. 抽选记录
create table public.draws (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.rooms(id) on delete cascade,
  drawn_by uuid not null,
  selected_name text not null
    check (char_length(btrim(selected_name)) between 1 and 60),
  created_at timestamptz not null default now(),
  foreign key (room_id, drawn_by)
    references public.members(room_id, id)
    on delete cascade
);

-- 方便查询某个房间最近的抽选记录
create index draws_room_created_at
  on public.draws (room_id, created_at desc);

-- 开启行级安全
alter table public.rooms enable row level security;
alter table public.members enable row level security;
alter table public.candidates enable row level security;
alter table public.draws enable row level security;

-- 普通前端不能直接访问这些表
revoke all on table
  public.rooms,
  public.members,
  public.candidates,
  public.draws
from public, anon, authenticated;

-- 由后端服务读写数据
grant select, insert, update, delete on table
  public.rooms,
  public.members,
  public.candidates,
  public.draws
to service_role;

commit;