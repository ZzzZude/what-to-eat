begin;

create or replace function public.add_candidate(
  p_room_id uuid,
  p_member_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_room_status text;
  v_candidate public.candidates%rowtype;
begin
  v_name := btrim(p_name);

  -- 检查候选名称
  if v_name is null
    or char_length(v_name) not between 1 and 60
  then
    raise exception 'CANDIDATE_NAME_INVALID'
      using errcode = '22023';
  end if;

  -- 锁定房间记录，检查房间状态
  select r.status
  into v_room_status
  from public.rooms as r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_room_status <> 'open' then
    raise exception 'ROOM_CLOSED'
      using errcode = 'P0001';
  end if;

  -- 再确认提交者属于这个房间
  if not exists (
    select 1
    from public.members as m
    where m.id = p_member_id
      and m.room_id = p_room_id
  ) then
    raise exception 'NOT_A_ROOM_MEMBER'
      using errcode = 'P0001';
  end if;

  -- 保存候选
  insert into public.candidates (
    room_id,
    submitted_by,
    name
  )
  values (
    p_room_id,
    p_member_id,
    v_name
  )
  returning * into v_candidate;

  -- 清单改变后，等待重新抽选
  update public.rooms
  set current_result = null
  where id = p_room_id;

  return jsonb_build_object(
    'id', v_candidate.id,
    'name', v_candidate.name,
    'submittedBy', v_candidate.submitted_by,
    'createdAt', v_candidate.created_at
  );
end;
$$;

revoke execute
on function public.add_candidate(uuid, uuid, text)
from public, anon, authenticated;

grant execute
on function public.add_candidate(uuid, uuid, text)
to service_role;

notify pgrst, 'reload schema';

commit;