import { NextResponse, type NextRequest } from "next/server";
import {
  requireRoomMember,
  RoomAccessError,
} from "@/lib/rooms/access";
import { DatabaseConfigurationError } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;

    // 先验证访问者确实是房间成员
    const { supabase, room, member } =
      await requireRoomMember(request, code);

    // 身份通过后，再读取成员和候选清单
    const [membersResult, candidatesResult] =
      await Promise.all([
        supabase
          .from("members")
          .select("id, nickname, role")
          .eq("room_id", room.id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .abortSignal(AbortSignal.timeout(10000)),

        supabase
          .from("candidates")
          .select("id, name, submitted_by, created_at")
          .eq("room_id", room.id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .abortSignal(AbortSignal.timeout(10000)),
      ]);

    if (membersResult.error || candidatesResult.error) {
      return fail(
        "ROOM_DATA_FAILED",
        "暂时无法读取完整房间信息，请稍后重试。",
        503
      );
    }

    const candidates = (candidatesResult.data ?? []).map(
      (candidate) => ({
        id: candidate.id,
        name: candidate.name,
        submittedBy: candidate.submitted_by,
        createdAt: candidate.created_at,
      })
    );

    return NextResponse.json(
      {
        ok: true,
        room: {
          code: room.code,
          status: room.status,
          currentResult: room.current_result,
        },
        currentMember: member,
        members: membersResult.data ?? [],
        candidates,
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