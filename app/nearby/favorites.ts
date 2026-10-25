import { readRestaurantSearchResult, restaurantSourceUrl, type Restaurant } from "./restaurants";

export const FAVORITES_STORAGE_KEY = "what-to-eat:nearby:favorites:v1";

type FavoriteStorage = Pick<Storage, "getItem" | "setItem">;
export type FavoriteUpdateResult =
  | { ok: true; added: boolean; restaurants: Restaurant[] }
  | { ok: false; message: string };

function savedRestaurant(restaurant: Restaurant): Restaurant {
  // 仅保留店铺信息，不保存搜索中心、设备位置或其他状态。
  return {
    id: restaurant.id,
    name: restaurant.name,
    address: restaurant.address,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    genre: restaurant.genre,
    sourceUrl: restaurantSourceUrl(restaurant.sourceUrl) ?? "",
  };
}

export function readSavedFavorites(text: string | null): Restaurant[] | null {
  if (text === null) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data) ||
      !("version" in data) || data.version !== 1 ||
      !("restaurants" in data) || !Array.isArray(data.restaurants)) return null;
    const result = readRestaurantSearchResult({
      ok: true,
      total: data.restaurants.length,
      restaurants: data.restaurants,
    });
    return result ? result.restaurants.map(savedRestaurant) : null;
  } catch {
    return null;
  }
}

export function toggleSavedFavorite(storage: FavoriteStorage, restaurant: Restaurant): FavoriteUpdateResult {
  try {
    // 每次修改前重读，合并其他标签页刚刚保存的内容。
    const current = readSavedFavorites(storage.getItem(FAVORITES_STORAGE_KEY));
    if (!current) return { ok: false, message: "现有收藏数据无法读取，原数据未改动。" };
    const checked = readRestaurantSearchResult({ ok: true, total: 1, restaurants: [restaurant] });
    if (!checked) return { ok: false, message: "餐馆信息不完整，暂时无法收藏。" };

    const added = !current.some((item) => item.id === restaurant.id);
    const restaurants = added
      ? [savedRestaurant(restaurant), ...current]
      : current.filter((item) => item.id !== restaurant.id);
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ version: 1, restaurants }));
    return { ok: true, added, restaurants };
  } catch {
    return { ok: false, message: "当前浏览器无法保存收藏，请检查网站的本地存储权限后重试。" };
  }
}
