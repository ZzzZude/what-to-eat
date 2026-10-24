begin;

create or replace function public.draw_room(
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
  v_selected_name text;
  v_draw_id uuid;
  v_created_at timestamptz;
begin
  -- 与添加、删除、清空一样，先锁定房间记录
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

  -- 从当前房间的候选中随机选择一个
  select c.name
  into v_selected_name
  from public.candidates as c
  where c.room_id = p_room_id
  order by random()
  limit 1;

  if not found then
    raise exception 'NO_CANDIDATES'
      using errcode = 'P0001';
  end if;

  -- 保存本次抽选历史
  insert into public.draws (
    room_id,
    drawn_by,
    selected_name
  )
  values (
    p_room_id,
    p_member_id,
    v_selected_name
  )
  returning id, created_at
  into v_draw_id, v_created_at;

  -- 更新所有成员共同读取的当前结果
  update public.rooms
  set current_result = v_selected_name
  where id = p_room_id;

  return jsonb_build_object(
    'drawId', v_draw_id,
    'selectedName', v_selected_name,
    'createdAt', v_created_at
  );
end;
$$;

revoke execute
on function public.draw_room(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.draw_room(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';

commit;
