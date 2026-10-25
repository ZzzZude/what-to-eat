export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  const apiKey = process.env.HOTPEPPER_API_KEY?.trim();
  const configured = Boolean(apiKey);

  return Response.json(
    {
      ok: configured,
      message: configured
        ? "已读取到餐馆搜索配置。"
        : "没有读取到 HOTPEPPER_API_KEY，请检查 .env.local。",
    },
    {
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}