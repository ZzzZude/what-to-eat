import type { Coordinates } from "./restaurants";

export type PlaceCandidate = Coordinates & {
  id: string;
  title: string;
};

export type SearchLocation = Coordinates & {
  label: string;
  source: "device" | "manual";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlace(value: unknown): value is PlaceCandidate {
  return isRecord(value) &&
    typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    typeof value.latitude === "number" && Number.isFinite(value.latitude) &&
    value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === "number" && Number.isFinite(value.longitude) &&
    value.longitude >= -180 && value.longitude <= 180;
}

export function normalizePlaceQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/站$/u, "駅");
}

export function isValidPlaceQuery(value: string): boolean {
  const characters = Array.from(value);
  return characters.length >= 2 && characters.length <= 100 &&
    characters.every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    });
}

export function readGsiPlaces(value: unknown, query: string): PlaceCandidate[] | null {
  if (!Array.isArray(value)) return null;

  const unique = new Map<string, PlaceCandidate>();
  for (const feature of value) {
    if (
      !isRecord(feature) || feature.type !== "Feature" ||
      !isRecord(feature.geometry) || feature.geometry.type !== "Point" ||
      !Array.isArray(feature.geometry.coordinates) ||
      !isRecord(feature.properties) || typeof feature.properties.title !== "string"
    ) continue;

    // GeoJSON 的顺序是经度、纬度，页面使用纬度、经度。
    const [longitude, latitude] = feature.geometry.coordinates;
    const title = feature.properties.title.trim();
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;

    const place = {
      id: `${title}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`,
      title,
      latitude,
      longitude,
    };
    if (isPlace(place) && !unique.has(place.id)) unique.set(place.id, place);
  }

  if (value.length > 0 && unique.size === 0) return null;

  const normalizedQuery = normalizePlaceQuery(query).replace(/\s/g, "");
  let places = Array.from(unique.values());

  // 地名服务也会返回相近的行政区。车站查询不能把这些地名当成车站。
  if (normalizedQuery.endsWith("駅")) {
    places = places.filter((place) => place.title.endsWith("駅"));
  }

  function rank(place: PlaceCandidate) {
    const title = place.title.normalize("NFKC").replace(/\s/g, "");
    if (title === normalizedQuery) return 0;
    if (title.endsWith(normalizedQuery)) return 1;
    if (title.includes(normalizedQuery)) return 2;
    return 3;
  }

  return places.sort((a, b) => rank(a) - rank(b)).slice(0, 10);
}

export function readPlaceSearchResult(value: unknown): PlaceCandidate[] | null {
  if (
    !isRecord(value) || value.ok !== true ||
    !Array.isArray(value.places) || !value.places.every(isPlace)
  ) return null;

  return Array.from(new Map(value.places.map((place) => [place.id, place])).values());
}

export function readPlaceSearchError(value: unknown): string {
  if (isRecord(value) && typeof value.message === "string" && value.message.trim()) {
    return value.message.trim().slice(0, 200);
  }
  return "地点检索暂时不可用，请稍后重试或使用当前位置。";
}

export function placeMapUrl(place: Coordinates): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.search = new URLSearchParams({
    api: "1",
    query: `${place.latitude},${place.longitude}`,
  }).toString();
  return url.href;
}
