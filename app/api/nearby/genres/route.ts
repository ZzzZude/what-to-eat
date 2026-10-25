import { getRestaurantGenres } from "@/lib/hotpepper/genres";

export const runtime = "nodejs";

export async function GET() {
  const result = await getRestaurantGenres();
  return Response.json(result.ok
    ? { ok: true, genres: result.genres }
    : { ok: false, message: result.message }, {
    status: result.ok ? 200 : result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
