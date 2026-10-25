import { readGenreCodes } from "@/app/nearby/genres";
import { getRestaurantGenres } from "@/lib/hotpepper/genres";
import { RESTAURANTS_PER_PAGE, readRestaurantSearchResult } from "@/app/nearby/restaurants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Shop = {
  id: string;
  name: string;
  address: string;
  lat: unknown;
  lng: unknown;
  genre?: { name?: string };
  urls?: { pc?: string };
};

type ApiData = {
  results?: {
    error?: { code?: string | number } | { code?: string | number }[];
    results_available?: number;
    shop?: Shop[];
  };
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function readCoordinate(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    return Number(value.trim());
  }
  // 空值、布尔值和数组不能通过数字转换被误当作有效的店铺坐标。
  return NaN;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat")?.trim() || "NaN");
  const lng = Number(params.get("lng")?.trim() || "NaN");
  const radius = Number(params.get("radius") ?? "1000");
  const genres = readGenreCodes(params.getAll("genre"));
  const startValue = params.get("start") ?? "1";
  const start = Number(startValue);

  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    return json({ ok: false, message: "请提供有效的经纬度。" }, 400);
  }

  const range = new Map([
    [500, "2"],
    [1000, "3"],
    [2000, "4"],
  ]).get(radius);

  if (!range) {
    return json({ ok: false, message: "搜索范围请选择 500、1000 或 2000 米。" }, 400);
  }

  if (!genres) {
    return json({ ok: false, message: "请从餐饮类型列表中选择一种或多种类型。" }, 400);
  }

  if (!/^\d+$/.test(startValue) || !Number.isSafeInteger(start) || start < 1 || start > 1000000) {
    return json({ ok: false, message: "餐馆列表位置无效，请重新查找。" }, 400);
  }

  const apiKey = process.env.HOTPEPPER_API_KEY?.trim();

  if (!apiKey) {
    return json({ ok: false, message: "尚未配置餐馆搜索 Key。" }, 503);
  }

  if (genres.length > 0) {
    const available = await getRestaurantGenres();
    if (!available.ok) {
      return json({ ok: false, message: available.message }, available.status);
    }
    if (genres.some((code) => !available.genres.some((item) => item.code === code))) {
      return json({ ok: false, message: "所选餐饮类型已不可用，请刷新页面后重新选择。" }, 400);
    }
  }

  const url = new URL("https://webservice.recruit.co.jp/hotpepper/gourmet/v1/");
  url.search = new URLSearchParams({
    key: apiKey,
    lat: String(lat),
    lng: String(lng),
    range,
    datum: "world",
    order: "1",
    count: String(RESTAURANTS_PER_PAGE),
    start: String(start),
    format: "json",
    type: "lite",
  }).toString();
  if (genres.length > 0) url.searchParams.set("genre", genres.join(","));

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });

    if (!response.ok) {
      return json({ ok: false, message: "餐馆服务暂时无法访问，请稍后重试。" }, 502);
    }

    const data = (await response.json()) as ApiData;
    const results = data?.results;

    if (results?.error) {
      const error = Array.isArray(results.error)
        ? results.error[0]
        : results.error;

      return json({
        ok: false,
        message: String(error?.code) === "2000"
          ? "API Key 未通过认证，请检查本地配置或服务商的访问限制。"
          : "餐馆服务返回错误，请稍后重试。",
      }, 502);
    }

    if (!results || !Array.isArray(results.shop)) {
      return json({ ok: false, message: "餐馆服务返回的数据格式不正确。" }, 502);
    }

    const rawRestaurants = results.shop.map((shop) => ({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      latitude: readCoordinate(shop.lat),
      longitude: readCoordinate(shop.lng),
      genre: shop.genre?.name ?? "",
      sourceUrl: shop.urls?.pc ?? "",
    }));

    const result = readRestaurantSearchResult({
      ok: true,
      total: results.results_available,
      restaurants: rawRestaurants,
    });
    if (!result || rawRestaurants.length > RESTAURANTS_PER_PAGE ||
      (start <= result.total && rawRestaurants.length === 0)) {
      return json({ ok: false, message: "餐馆服务返回的数据不完整，请重试。" }, 502);
    }

    const next = start + rawRestaurants.length;

    return json({
      ok: true,
      source: "Hot Pepper Gourmet",
      ...result,
      count: result.restaurants.length,
      start,
      nextStart: rawRestaurants.length > 0 && next <= result.total ? next : null,
    });
  } catch {
    return json({ ok: false, message: "搜索失败或超时，请稍后重试。" }, 502);
  }
}
