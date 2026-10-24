begin;

create or replace function public.clear_room_candidates(
  p_room_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room_status text;
  v_member_role text;
  v_deleted_count bigint;
begin
  -- 锁定房间，检查状态
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

  -- 查询操作人的真实角色
  select m.role
  into v_member_role
  from public.members as m
  where m.id = p_member_id
    and m.room_id = p_room_id;

  if not found then
    raise exception 'NOT_A_ROOM_MEMBER'
      using errcode = '42501';
  end if;

  if v_member_role <> 'host' then
    raise exception 'HOST_ONLY'
      using errcode = '42501';
  end if;

  -- 只删除当前房间的候选
  delete from public.candidates
  where room_id = p_room_id;

  -- 记录这次实际删除的数量
  get diagnostics v_deleted_count = row_count;

  -- 清除当前抽选结果
  update public.rooms
  set current_result = null
  where id = p_room_id;

  return jsonb_build_object(
    'deletedCount', v_deleted_count
  );
end;
$$;

revoke execute
on function public.clear_room_candidates(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.clear_room_candidates(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';

commit;