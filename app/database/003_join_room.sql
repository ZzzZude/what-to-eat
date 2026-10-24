begin;

create or replace function public.join_room(
  p_room_code text,
  p_nickname text,
  p_token_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_room_status text;
  v_nickname text;
  v_member_id uuid;
  v_member_name text;
  v_member_role text;
begin
  v_nickname := btrim(p_nickname);

  -- 检查房间号
  if p_room_code is null
    or p_room_code !~ '^[0-9]{6}$'
  then
    raise exception 'ROOM_CODE_INVALID'
      using errcode = '22023';
  end if;

  -- 检查昵称
  if v_nickname is null
    or char_length(v_nickname) not between 1 and 20
  then
    raise exception 'NICKNAME_INVALID'
      using errcode = '22023';
  end if;

  -- 检查成员凭证摘要
  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'TOKEN_HASH_INVALID'
      using errcode = '22023';
  end if;

  -- 查找房间，并锁定这条房间记录
  select r.id, r.status
  into v_room_id, v_room_status
  from public.rooms as r
  where r.code = p_room_code
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_room_status <> 'open' then
    raise exception 'ROOM_CLOSED'
      using errcode = 'P0001';
  end if;

  -- 已有相同凭证时，沿用原来的成员身份
  select m.id, m.nickname, m.role
  into v_member_id, v_member_name, v_member_role
  from public.members as m
  where m.room_id = v_room_id
    and m.token_hash = p_token_hash;

  -- 没找到原身份，才新增普通成员
  if not found then
    insert into public.members (
      room_id,
      nickname,
      role,
      token_hash
    )
    values (
      v_room_id,
      v_nickname,
      'member',
      p_token_hash
    )
    returning id, nickname, role
    into v_member_id, v_member_name, v_member_role;
  end if;

  return jsonb_build_object(
    'roomId', v_room_id,
    'roomCode', p_room_code,
    'memberId', v_member_id,
    'nickname', v_member_name,
    'role', v_member_role
  );
end;
$$;

-- 普通访客不能直接调用
revoke execute
on function public.join_room(text, text, text)
from public, anon, authenticated;

-- 允许我们自己的后端调用
grant execute
on function public.join_room(text, text, text)
to service_role;

-- 通知接口更新函数列表
notify pgrst, 'reload schema';

commit;