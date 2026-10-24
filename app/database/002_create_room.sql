begin;

create or replace function public.create_room(
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
  v_member_id uuid;
  v_nickname text;
begin
  v_nickname := btrim(p_nickname);

  -- 检查六位房间号
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

  -- 检查成员身份凭证摘要
  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'TOKEN_HASH_INVALID'
      using errcode = '22023';
  end if;

  -- 保存房间
  insert into public.rooms (code)
  values (p_room_code)
  returning id into v_room_id;

  -- 保存房主
  insert into public.members (
    room_id,
    nickname,
    role,
    token_hash
  )
  values (
    v_room_id,
    v_nickname,
    'host',
    p_token_hash
  )
  returning id into v_member_id;

  -- 返回后端需要的信息
  return jsonb_build_object(
    'roomId', v_room_id,
    'roomCode', p_room_code,
    'memberId', v_member_id,
    'nickname', v_nickname,
    'role', 'host'
  );
end;
$$;

-- 仅允许后端服务调用
revoke execute
on function public.create_room(text, text, text)
from public, anon, authenticated;

grant execute
on function public.create_room(text, text, text)
to service_role;

-- 通知接口刷新函数列表
notify pgrst, 'reload schema';

commit;