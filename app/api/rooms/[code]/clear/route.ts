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
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    const { code } = await context.params;

    const { supabase, room, member } =
      await requireRoomMember(request, code);

    // 后端先检查房主身份
    if (member.role !== "host") {
      return fail(
        "HOST_ONLY",
        "只有房主可以清空共享清单。",
        403
      );
    }

    // 数据库内部还会再次检查身份和房间状态
    const { data, error } = await supabase
      .rpc("clear_room_candidates", {
        p_room_id: room.id,
        p_member_id: member.id,
      })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      if (
        error.message === "HOST_ONLY" ||
        error.message === "NOT_A_ROOM_MEMBER"
      ) {
        return fail(
          "HOST_ONLY",
          "当前身份没有清空权限，请重新确认房主身份。",
          403
        );
      }

      if (error.message === "ROOM_NOT_FOUND") {
        return fail(
          "ROOM_NOT_FOUND",
          "找不到这个房间。",
          404
        );
      }

      if (error.message === "ROOM_CLOSED") {
        return fail(
          "ROOM_CLOSED",
          "房间已经关闭，不能清空清单。",
          409
        );
      }

      if (error.code === "PGRST202") {
        return fail(
          "FUNCTION_NOT_FOUND",
          "数据库尚未识别清空函数，请检查 006 SQL。",
          503
        );
      }

      return fail(
        "CLEAR_FAILED",
        "清空失败，请稍后重试。",
        503
      );
    }

    if (
      !data ||
      typeof data.deletedCount !== "number" ||
      !Number.isInteger(data.deletedCount) ||
      data.deletedCount < 0
    ) {
      return fail(
        "INVALID_RESULT",
        "数据库没有返回有效的清空结果。",
        503
      );
    }

    return NextResponse.json(
      {
        ok: true,
        deletedCount: data.deletedCount,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return fail(error.code, error.message, error.status);
    }

    if (error instanceof DatabaseConfigurationError) {
      return fail(error.code, error.message, 503);
    }

    return fail(
      "SERVER_ERROR",
      "服务暂时不可用，请稍后重试。",
      503
    );
  }
}