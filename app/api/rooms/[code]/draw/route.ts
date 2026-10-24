import { NextResponse, type NextRequest } from "next/server";
import {
  requireRoomMember,
  RoomAccessError,
} from "@/lib/rooms/access";
import { DatabaseConfigurationError } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { ok: false, code, message },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const { supabase, room, member } =
      await requireRoomMember(request, code);

    if (member.role !== "host") {
      return fail("HOST_ONLY", "只有房主可以发起统一抽选。", 403);
    }

    // 不读取用户指定的结果，完全从数据库候选中抽选
    const { data, error } = await supabase
      .rpc("draw_room", {
        p_room_id: room.id,
        p_member_id: member.id,
      })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      if (
        error.message === "HOST_ONLY" ||
        error.message === "NOT_A_ROOM_MEMBER"
      ) {
        return fail("HOST_ONLY", "当前身份没有抽选权限。", 403);
      }

      if (error.message === "NO_CANDIDATES") {
        return fail("NO_CANDIDATES", "请先添加至少一个候选。", 409);
      }

      if (error.message === "ROOM_CLOSED") {
        return fail("ROOM_CLOSED", "房间已经关闭，不能抽选。", 409);
      }

      if (error.message === "ROOM_NOT_FOUND") {
        return fail("ROOM_NOT_FOUND", "找不到这个房间。", 404);
      }

      if (error.code === "PGRST202") {
        return fail(
          "FUNCTION_NOT_FOUND",
          "数据库尚未识别抽选函数，请检查 007 SQL。",
          503
        );
      }

      return fail("DRAW_FAILED", "抽选失败，请稍后重试。", 503);
    }

    if (
      !data ||
      typeof data.drawId !== "string" ||
      typeof data.selectedName !== "string" ||
      data.selectedName.length === 0 ||
      typeof data.createdAt !== "string"
    ) {
      return fail("INVALID_RESULT", "数据库没有返回有效的抽选结果。", 503);
    }

    return NextResponse.json(
      {
        ok: true,
        draw: {
          id: data.drawId,
          selectedName: data.selectedName,
          createdAt: data.createdAt,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return fail(error.code, error.message, error.status);
    }

    if (error instanceof DatabaseConfigurationError) {
      return fail(error.code, error.message, 503);
    }

    return fail("SERVER_ERROR", "服务暂时不可用，请稍后重试。", 503);
  }
}
