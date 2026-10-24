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
  context: { params: Promise<{ code: string }> }
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail("INVALID_JSON", "提交的数据格式不正确。", 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return fail("INVALID_BODY", "请提交候选名称。", 400);
  }

  const rawName = "name" in body ? body.name : undefined;

  if (typeof rawName !== "string") {
    return fail(
      "INVALID_CANDIDATE",
      "请输入食物或餐馆名称。",
      400
    );
  }

  const name = rawName.trim();

  if (
    Array.from(name).length < 1 ||
    Array.from(name).length > 60
  ) {
    return fail(
      "INVALID_CANDIDATE",
      "候选名称需要填写 1～60 个字符。",
      400
    );
  }

  try {
    const { code } = await context.params;

    const { supabase, room, member } =
      await requireRoomMember(request, code);

    // 房间和提交者编号来自后端身份检查
    const { data, error } = await supabase
      .rpc("add_candidate", {
        p_room_id: room.id,
        p_member_id: member.id,
        p_name: name,
      })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      if (error.code === "23505") {
        return fail(
          "CANDIDATE_EXISTS",
          "这个选项已经在房间清单里了。",
          409
        );
      }

      if (error.code === "P0002") {
        return fail(
          "ROOM_NOT_FOUND",
          "找不到这个房间。",
          404
        );
      }

      if (error.message === "ROOM_CLOSED") {
        return fail(
          "ROOM_CLOSED",
          "房间已经关闭，不能继续添加候选。",
          409
        );
      }

      if (error.message === "NOT_A_ROOM_MEMBER") {
        return fail(
          "NOT_A_ROOM_MEMBER",
          "你已不属于这个房间，请重新加入。",
          403
        );
      }

      if (error.code === "22023") {
        return fail(
          "INVALID_CANDIDATE",
          "候选名称需要填写 1～60 个字符。",
          400
        );
      }

      if (error.code === "PGRST202") {
        return fail(
          "FUNCTION_NOT_FOUND",
          "数据库尚未识别添加候选函数，请检查 004 SQL。",
          503
        );
      }

      return fail(
        "ADD_CANDIDATE_FAILED",
        "添加候选失败，请稍后重试。",
        503
      );
    }

    if (!data || typeof data.id !== "string") {
      return fail(
        "INVALID_RESULT",
        "数据库没有返回有效的候选信息。",
        503
      );
    }

    return NextResponse.json(
      {
        ok: true,
        candidate: {
          id: data.id,
          name: data.name,
          submittedBy: data.submittedBy,
          createdAt: data.createdAt,
        },
      },
      {
        status: 201,
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