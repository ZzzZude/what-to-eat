begin;

create or replace function public.delete_candidate(
  p_room_id uuid,
  p_member_id uuid,
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room_status text;
  v_member_role text;
  v_candidate_owner uuid;
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

  -- 候选必须属于当前房间
  select c.submitted_by
  into v_candidate_owner
  from public.candidates as c
  where c.id = p_candidate_id
    and c.room_id = p_room_id
  for update;

  if not found then
    raise exception 'CANDIDATE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  -- 房主可以删除全部，成员只能删除自己的
  if v_member_role <> 'host'
    and v_candidate_owner <> p_member_id
  then
    raise exception 'DELETE_FORBIDDEN'
      using errcode = '42501';
  end if;

  delete from public.candidates
  where id = p_candidate_id
    and room_id = p_room_id;

  -- 清单改变后，需要重新抽选
  update public.rooms
  set current_result = null
  where id = p_room_id;

  return jsonb_build_object(
    'deletedId', p_candidate_id
  );
end;
$$;

revoke execute
on function public.delete_candidate(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.delete_candidate(uuid, uuid, uuid)
to service_role;

notify pgrst, 'reload schema';

commit;