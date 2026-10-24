import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class RoomAccessError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RoomAccessError";
    this.code = code;
    this.status = status;
  }
}

export async function requireRoomMember(
  request: NextRequest,
  roomCode: string
) {
  // 检查房间号
  if (!/^[0-9]{6}$/.test(roomCode)) {
    throw new RoomAccessError(
      "INVALID_ROOM_CODE",
      "房间号需要填写六位数字。",
      400
    );
  }

  // 读取这个房间对应的成员凭证
  const token = request.cookies.get(
    `wte_member_${roomCode}`
  )?.value;

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new RoomAccessError(
      "MEMBER_COOKIE_REQUIRED",
      "没有找到成员身份，请先创建或加入这个房间。",
      401
    );
  }

  const supabase = createAdminClient();

  // 查询房间
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, status, current_result")
    .eq("code", roomCode)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();

  if (roomError) {
    throw new RoomAccessError(
      "ROOM_LOOKUP_FAILED",
      "暂时无法读取房间，请稍后重试。",
      503
    );
  }

  if (!room) {
    throw new RoomAccessError(
      "ROOM_NOT_FOUND",
      "找不到这个房间。",
      404
    );
  }

  // 用摘要核对成员身份
  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const { data: member, error: memberError } =
    await supabase
      .from("members")
      .select("id, nickname, role")
      .eq("room_id", room.id)
      .eq("token_hash", tokenHash)
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();

  if (memberError) {
    throw new RoomAccessError(
      "MEMBER_LOOKUP_FAILED",
      "暂时无法确认成员身份，请稍后重试。",
      503
    );
  }

  if (!member) {
    throw new RoomAccessError(
      "NOT_A_ROOM_MEMBER",
      "当前凭证不属于这个房间，请重新加入。",
      403
    );
  }

  return {
    supabase,
    room,
    member,
  };
}