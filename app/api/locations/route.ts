import { isValidPlaceQuery, normalizePlaceQuery, readGsiPlaces } from "@/app/nearby/locations";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const query = normalizePlaceQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (!isValidPlaceQuery(query)) {
    return json({ ok: false, message: "请输入 2～100 个字符的日本车站、地址或地点。" }, 400);
  }

  const url = new URL("https://msearch.gsi.go.jp/address-search/AddressSearch");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) {
      return json({ ok: false, message: "地点检索服务暂时无法访问，请稍后重试或使用当前位置。" }, 502);
    }

    const data: unknown = await response.json();
    const places = readGsiPlaces(data, query);
    if (!places) {
      return json({ ok: false, message: "地点检索返回的数据格式不正确，请稍后重试。" }, 502);
    }

    return json({ ok: true, source: "国土地理院 地理院地図", query, places });
  } catch {
    return json({ ok: false, message: "地点检索失败或超时，请重试，也可以使用当前位置。" }, 502);
  }
}
