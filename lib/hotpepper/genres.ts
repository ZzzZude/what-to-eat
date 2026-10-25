import "server-only";
import { readHotPepperGenres, type RestaurantGenre } from "@/app/nearby/genres";

type GenreResult =
  | { ok: true; genres: RestaurantGenre[] }
  | { ok: false; status: number; message: string };

export async function getRestaurantGenres(): Promise<GenreResult> {
  const apiKey = process.env.HOTPEPPER_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "尚未配置餐馆搜索 Key。" };
  }

  const url = new URL("https://webservice.recruit.co.jp/hotpepper/genre/v1/");
  url.search = new URLSearchParams({ key: apiKey, format: "json" }).toString();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    const genres = response.ok ? readHotPepperGenres(await response.json()) : null;
    if (genres) return { ok: true, genres };
  } catch {
    // 不向浏览器转发上游异常，避免请求中的 Key 泄漏。
  }

  return { ok: false, status: 502, message: "餐饮类型暂时无法读取，请重试，或选择不限类型后查找。" };
}
