export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Restaurant = Coordinates & {
  id: string;
  name: string;
  address: string;
  genre: string;
  sourceUrl: string;
};

export type RestaurantSearchResult = {
  total: number;
  restaurants: Restaurant[];
};

export const RESTAURANTS_PER_PAGE = 20;

export type RestaurantPageResult = RestaurantSearchResult & {
  nextStart: number | null;
};

export type RestaurantSearchConditions = Coordinates & {
  radius: number;
  genreCodes: string[];
};

export type RestaurantSearchSnapshot = RestaurantPageResult & RestaurantSearchConditions & {
  searchId: number;
  locationLabel: string;
  locationSource?: "device" | "manual";
  genreLabel: string;
};

export function restaurantSearchParams(conditions: RestaurantSearchConditions, start = 1): URLSearchParams {
  const params = new URLSearchParams({
    lat: String(conditions.latitude),
    lng: String(conditions.longitude),
    radius: String(conditions.radius),
    start: String(start),
  });
  if (conditions.genreCodes.length > 0) params.set("genre", conditions.genreCodes.join(","));
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRestaurant(value: unknown): value is Restaurant {
  return (
    isRecord(value) &&
    typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    typeof value.address === "string" &&
    typeof value.genre === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 && value.longitude <= 180
  );
}

export function readRestaurantSearchResult(
  value: unknown
): RestaurantSearchResult | null {
  if (
    !isRecord(value) || value.ok !== true ||
    typeof value.total !== "number" ||
    !Number.isInteger(value.total) || value.total < 0 ||
    !Array.isArray(value.restaurants) ||
    !value.restaurants.every(isRestaurant)
  ) {
    return null;
  }

  // 同一家店只显示一次，保留接口返回的顺序。
  const restaurants = Array.from(
    new Map(value.restaurants.map((restaurant) => [restaurant.id, restaurant])).values()
  );

  if (value.total < restaurants.length) return null;

  return { total: value.total, restaurants };
}

export function readRestaurantPageResult(value: unknown, start = 1): RestaurantPageResult | null {
  const result = readRestaurantSearchResult(value);
  if (!result || !isRecord(value) || value.start !== start ||
    result.restaurants.length > RESTAURANTS_PER_PAGE ||
    !(value.nextStart === null || (result.restaurants.length > 0 && typeof value.nextStart === "number" &&
      Number.isSafeInteger(value.nextStart) && value.nextStart > start &&
      value.nextStart <= start + RESTAURANTS_PER_PAGE && value.nextStart <= result.total))) {
    return null;
  }
  return { ...result, nextStart: value.nextStart };
}

export function readSearchErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.message === "string" && value.message.trim()) {
    return value.message.trim().slice(0, 200);
  }

  return "餐馆数据暂时无法读取，请稍后重试。";
}

export function restaurantSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const isHotPepper = url.hostname === "hotpepper.jp" ||
      url.hostname.endsWith(".hotpepper.jp");

    if (
      url.protocol !== "https:" || !isHotPepper ||
      url.username || url.password || url.port
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(to.latitude - from.latitude);
  const longitudeDifference = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) *
    Math.sin(longitudeDifference / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, a));

  return 6371000 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

export function formatDistance(meters: number, locale: "zh" | "ja" | "en" = "zh"): string {
  const rounded = Math.round(meters);
  return rounded < 1000
    ? `${rounded} ${locale === "zh" ? "米" : "m"}`
    : `${(meters / 1000).toFixed(1)} ${locale === "zh" ? "公里" : "km"}`;
}

export function pickRestaurant(
  restaurants: readonly Restaurant[],
  chosenIds: readonly string[],
  random: () => number = Math.random
): Restaurant | null {
  const chosen = new Set(chosenIds);
  const remaining = new Map<string, Restaurant>();

  for (const restaurant of restaurants) {
    if (!chosen.has(restaurant.id) && !remaining.has(restaurant.id)) {
      remaining.set(restaurant.id, restaurant);
    }
  }

  const candidates = Array.from(remaining.values());
  if (candidates.length === 0) return null;

  return candidates[Math.floor(random() * candidates.length)] ?? null;
}

export function restaurantDirectionsUrl(restaurant: Coordinates): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.search = new URLSearchParams({
    api: "1",
    destination: `${restaurant.latitude},${restaurant.longitude}`,
    travelmode: "walking",
    dir_action: "navigate",
  }).toString();

  return url.href;
}
