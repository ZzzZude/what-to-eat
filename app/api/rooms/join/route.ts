import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminClient,
  DatabaseConfigurationError,
} from "@/lib/supabase/admin";

export const runtime = "nodejs";

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { ok: false, code, message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: NextRequest) {
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
    return fail(
      "INVALID_BODY",
      "请提交房间号和昵称。",
      400
    );
  }

  const rawRoomCode =
    "roomCode" in body ? body.roomCode : undefined;

  const rawNickname =
    "nickname" in body ? body.nickname : undefined;

  // 检查房间号
  if (typeof rawRoomCode !== "string") {
    return fail("INVALID_ROOM_CODE", "请输入六位房间号。", 400);
  }

  const roomCode = rawRoomCode.trim();

  if (!/^[0-9]{6}$/.test(roomCode)) {
    return fail(
      "INVALID_ROOM_CODE",
      "房间号需要填写六位数字。",
      400
    );
  }

  // 检查昵称
  if (typeof rawNickname !== "string") {
    return fail("INVALID_NICKNAME", "请输入昵称。", 400);
  }

  const nickname = rawNickname.trim();

  if (
    Array.from(nickname).length < 1 ||
    Array.from(nickname).length > 20
  ) {
    return fail(
      "INVALID_NICKNAME",
      "昵称需要填写 1～20 个字符。",
      400
    );
  }

  try {
    const supabase = createAdminClient();
    const cookieName = `wte_member_${roomCode}`;

    // 默认生成一份新成员凭证
    let memberToken = randomBytes(32).toString("base64url");

    // 如果浏览器已有凭证，先检查是否属于这个房间
    const savedToken = request.cookies.get(cookieName)?.value;

    if (
      savedToken &&
      /^[A-Za-z0-9_-]{43}$/.test(savedToken)
    ) {
      const savedHash = createHash("sha256")
        .update(savedToken)
        .digest("hex");

      const { data: existingMember, error: lookupError } =
        await supabase
          .from("members")
          .select("id, rooms!inner(code)")
          .eq("token_hash", savedHash)
          .eq("rooms.code", roomCode)
          .abortSignal(AbortSignal.timeout(10000))
          .maybeSingle();

      if (lookupError) {
        return fail(
          "MEMBER_LOOKUP_FAILED",
          "暂时无法确认成员身份，请稍后重试。",
          503
        );
      }

      if (existingMember) {
        memberToken = savedToken;
      }
    }

    const tokenHash = createHash("sha256")
      .update(memberToken)
      .digest("hex");

    // 调用上一阶段建立的数据库函数
    const { data, error } = await supabase
      .rpc("join_room", {
        p_room_code: roomCode,
        p_nickname: nickname,
        p_token_hash: tokenHash,
      })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      if (error.code === "P0002") {
        return fail(
          "ROOM_NOT_FOUND",
          "找不到这个房间，请检查房间号。",
          404
        );
      }

      if (
        error.code === "P0001" &&
        error.message === "ROOM_CLOSED"
      ) {
        return fail(
          "ROOM_CLOSED",
          "这个房间已经关闭，暂时无法加入。",
          409
        );
      }

      if (error.code === "PGRST202") {
        return fail(
          "FUNCTION_NOT_FOUND",
          "数据库尚未识别加入房间函数，请检查 003 SQL。",
          503
        );
      }

      return fail(
        "JOIN_ROOM_FAILED",
        "加入房间失败，请检查数据库连接后重试。",
        503
      );
    }

    if (
      !data ||
      data.roomCode !== roomCode ||
      typeof data.memberId !== "string" ||
      typeof data.nickname !== "string" ||
      (data.role !== "host" && data.role !== "member")
    ) {
      return fail(
        "INVALID_RESULT",
        "数据库没有返回有效的成员信息。",
        503
      );
    }

    const response = NextResponse.json(
      {
        ok: true,
        roomCode: data.roomCode,
        memberId: data.memberId,
        nickname: data.nickname,
        role: data.role,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );

    response.cookies.set(cookieName, memberToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
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