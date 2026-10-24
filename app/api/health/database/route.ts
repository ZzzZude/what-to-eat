import {
  createAdminClient,
  DatabaseConfigurationError,
} from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tableNames = [
  "rooms",
  "members",
  "candidates",
  "draws",
];

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  try {
    const supabase = createAdminClient();

    const checks = await Promise.all(
      tableNames.map(async (table) => {
        const { error } = await supabase
          .from(table)
          .select("id", { head: true })
          .abortSignal(AbortSignal.timeout(10000));

        return {
          table,
          ok: !error,
          code: error ? error.code || "QUERY_FAILED" : null,
        };
      })
    );

    const ok = checks.every((check) => check.ok);

    return Response.json(
      {
        ok,
        message: ok
          ? "数据库连接成功，四张表均可访问。"
          : "部分检查失败，请查看 checks 中的错误代码。",
        checks,
      },
      {
        status: ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return Response.json(
      {
        ok: false,
        code: "CONNECTION_FAILED",
        message: "连接失败，请检查项目URL、Secret key和网络。",
      },
      { status: 503 }
    );
  }
}
