import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  // 第一步：读取请求里的 JSON
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail("INVALID_JSON", "提交的数据格式不正确。", 400);
  }

  // 第二步：确认提交的是一个对象
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return fail("INVALID_BODY", "请提交包含昵称的数据。", 400);
  }

  // 第三步：检查昵称
  const rawNickname =
    "nickname" in body ? body.nickname : undefined;

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

    // 成员凭证由后端生成，原文只交给浏览器保存
    const memberToken = randomBytes(32).toString("base64url");

    // 数据库只保存凭证的摘要
    const tokenHash = createHash("sha256")
      .update(memberToken)
      .digest("hex");

    // 如果房间号重复，最多重新生成五次
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomCode = randomInt(100000, 1000000).toString();

      const { data, error } = await supabase
        .rpc("create_room", {
          p_room_code: roomCode,
          p_nickname: nickname,
          p_token_hash: tokenHash,
        })
        .abortSignal(AbortSignal.timeout(10000));

      if (error) {
        // 唯一约束冲突：重新生成房间号后再试
        if (error.code === "23505") {
          continue;
        }

        if (error.code === "PGRST202") {
          return fail(
            "FUNCTION_NOT_FOUND",
            "数据库尚未识别创建房间函数，请检查上一阶段的 SQL。",
            503
          );
        }

        return fail(
          "CREATE_ROOM_FAILED",
          "创建房间失败，请检查数据库连接后重试。",
          503
        );
      }

      if (!data) {
        return fail(
          "EMPTY_RESULT",
          "数据库没有返回房间信息。",
          503
        );
      }

      // 返回房间信息，不把成员凭证放进 JSON
      const response = NextResponse.json(
        {
          ok: true,
          roomCode: data.roomCode,
          nickname: data.nickname,
          role: data.role,
        },
        {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        }
      );

      // 每个房间使用独立的成员 Cookie
      response.cookies.set(
        `wte_member_${roomCode}`,
        memberToken,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        }
      );

      return response;
    }

    return fail(
      "ROOM_CODE_BUSY",
      "暂时没能生成可用房间号，请重新尝试。",
      503
    );
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