import { readSavedFavorites } from "./favorites";
import type { Restaurant } from "./restaurants";

export const REGULAR_RESTAURANTS_KEY = "what-to-eat:nearby:regular:v1";
export const MAX_REGULAR_RESTAURANTS = 100;

export type RegularRestaurant = {
  id: string;
  name: string;
  included: boolean;
  restaurant?: Restaurant;
};

export type RegularUpdate =
  | { type: "addNames"; text: string }
  | { type: "addFavorite"; restaurant: Restaurant }
  | { type: "include"; id: string; included: boolean }
  | { type: "includeAll" }
  | { type: "remove"; id: string };

export type RegularUpdateResult =
  | { ok: true; entries: RegularRestaurant[]; added: number }
  | { ok: false; message: string };

function nameKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function readRegularRestaurants(text: string | null): RegularRestaurant[] | null {
  if (text === null) return [];
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.entries) ||
      data.entries.length > MAX_REGULAR_RESTAURANTS) return null;
    const entries: RegularRestaurant[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const item of data.entries) {
      if (!item || typeof item.id !== "string" || !item.id.trim() ||
        typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 60 ||
        typeof item.included !== "boolean") return null;
      let restaurant: Restaurant | undefined;
      if (item.restaurant !== undefined) {
        const checked = readSavedFavorites(JSON.stringify({ version: 1, restaurants: [item.restaurant] }));
        if (!checked?.[0] || checked[0].name.trim() !== item.name.trim()) return null;
        restaurant = checked[0];
      }
      const key = nameKey(item.name);
      if (ids.has(item.id) || names.has(key)) continue;
      ids.add(item.id);
      names.add(key);
      entries.push({ id: item.id, name: item.name.trim(), included: item.included, ...(restaurant ? { restaurant } : {}) });
    }
    return entries;
  } catch {
    return null;
  }
}

export function isRegularRestaurant(entries: readonly RegularRestaurant[], restaurant: Restaurant): boolean {
  return entries.some((entry) => entry.restaurant?.id === restaurant.id || nameKey(entry.name) === nameKey(restaurant.name));
}

export function updateRegularRestaurants(
  storage: Pick<Storage, "getItem" | "setItem">,
  update: RegularUpdate,
): RegularUpdateResult {
  try {
    // 先重读再修改，保留其他标签页刚刚加入的店铺。
    let entries = readRegularRestaurants(storage.getItem(REGULAR_RESTAURANTS_KEY));
    if (!entries) return { ok: false, message: "常吃清单暂时无法读取，原数据未改动。" };
    let added = 0;
    if (update.type === "addNames") {
      const names = update.text.split(/[\n,，、;；]+/).map((name) => name.trim()).filter(Boolean);
      if (names.length === 0 || names.some((name) => name.length > 60)) {
        return { ok: false, message: "请填写店名，每家 1～60 个字符，可换行添加多家。" };
      }
      const known = new Set(entries.map((entry) => nameKey(entry.name)));
      for (const name of names) {
        const key = nameKey(name);
        if (known.has(key)) continue;
        known.add(key);
        entries.push({ id: `manual:${key}`, name, included: true });
        added += 1;
      }
    } else if (update.type === "addFavorite") {
      const checked = readSavedFavorites(JSON.stringify({ version: 1, restaurants: [update.restaurant] }));
      const restaurant = checked?.[0];
      if (!restaurant || restaurant.name.trim().length > 60) return { ok: false, message: "餐馆信息不完整，暂时无法加入常吃清单。" };
      const existing = entries.find((entry) => entry.restaurant?.id === restaurant.id || nameKey(entry.name) === nameKey(restaurant.name));
      if (existing) {
        entries = entries.map((entry) => entry.id === existing.id ? { ...entry, name: restaurant.name.trim(), restaurant } : entry);
      } else {
        entries.push({ id: `favorite:${restaurant.id}`, name: restaurant.name.trim(), included: true, restaurant });
        added = 1;
      }
    } else if (update.type === "remove") {
      entries = entries.filter((entry) => entry.id !== update.id);
    } else {
      entries = entries.map((entry) => update.type === "includeAll" || entry.id === update.id
        ? { ...entry, included: update.type === "includeAll" || update.included }
        : entry);
    }
    if (entries.length > MAX_REGULAR_RESTAURANTS) return { ok: false, message: "常吃清单最多保存 100 家，请先移除一些店铺。" };
    storage.setItem(REGULAR_RESTAURANTS_KEY, JSON.stringify({ version: 1, entries }));
    return { ok: true, entries, added };
  } catch {
    return { ok: false, message: "当前浏览器无法保存常吃清单，请检查网站的本地存储权限后重试。" };
  }
}

export function pickRegularRestaurant(
  entries: readonly RegularRestaurant[],
  chosenIds: readonly string[],
  random: () => number = Math.random,
): RegularRestaurant | null {
  const remaining = entries.filter((entry) => entry.included && !chosenIds.includes(entry.id));
  if (remaining.length === 0) return null;
  return remaining[Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)))];
}
