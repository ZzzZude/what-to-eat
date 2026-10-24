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

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
      candidateId: string;
    }>;
  }
) {
  try {
    const { code, candidateId: rawCandidateId } =
      await context.params;

    const candidateId = rawCandidateId.toLowerCase();

    // 检查候选编号的 UUID 格式
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        candidateId
      )
    ) {
      return fail(
        "INVALID_CANDIDATE_ID",
        "候选编号格式不正确。",
        400
      );
    }

    const { supabase, room, member } =
      await requireRoomMember(request, code);

    // 操作人编号来自 Cookie 身份检查
    const { data, error } = await supabase
      .rpc("delete_candidate", {
        p_room_id: room.id,
        p_member_id: member.id,
        p_candidate_id: candidateId,
      })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      if (error.code === "42501") {
        return fail(
          "DELETE_FORBIDDEN",
          "没有删除权限：成员只能删除自己提交的候选。",
          403
        );
      }

      if (error.message === "CANDIDATE_NOT_FOUND") {
        return fail(
          "CANDIDATE_NOT_FOUND",
          "这个候选不存在，可能已经被其他成员删除。",
          404
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
          "房间已经关闭，不能删除候选。",
          409
        );
      }

      if (error.code === "PGRST202") {
        return fail(
          "FUNCTION_NOT_FOUND",
          "数据库尚未识别删除候选函数，请检查 005 SQL。",
          503
        );
      }

      return fail(
        "DELETE_CANDIDATE_FAILED",
        "删除失败，请稍后重试。",
        503
      );
    }

    if (!data || data.deletedId !== candidateId) {
      return fail(
        "INVALID_RESULT",
        "数据库没有返回有效的删除结果。",
        503
      );
    }

    return NextResponse.json(
      {
        ok: true,
        deletedId: data.deletedId,
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