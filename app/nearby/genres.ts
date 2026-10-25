export type RestaurantGenre = {
  code: string;
  name: string;
};

const chineseNames: Record<string, string> = {
  居酒屋: "居酒屋",
  "ダイニングバー・バル": "餐酒吧",
  創作料理: "创意料理",
  和食: "和食",
  洋食: "西式料理",
  "イタリアン・フレンチ": "意式／法式料理",
  中華: "中华料理",
  "焼肉・ホルモン": "烤肉／内脏料理",
  韓国料理: "韩国料理",
  "アジア・エスニック料理": "亚洲／异国料理",
  各国料理: "各国料理",
  "カラオケ・パーティ": "卡拉 OK／聚会",
  "バー・カクテル": "酒吧／鸡尾酒",
  "ラーメン": "拉面",
  "お好み焼き・もんじゃ": "大阪烧／文字烧",
  "カフェ・スイーツ": "咖啡厅／甜点",
  その他グルメ: "其他美食",
};

export function isGenreCode(value: string): boolean {
  return /^G\d{3}$/.test(value);
}

export function readGenreCodes(values: readonly string[]): string[] | null {
  if (values.length === 0 || (values.length === 1 && !values[0].trim())) return [];
  const codes = values.flatMap((value) => value.split(",").map((code) => code.trim()));
  if (codes.length > 30 || codes.some((code) => !isGenreCode(code))) return null;
  return [...new Set(codes)];
}

export function genreLabel(genre: RestaurantGenre): string {
  return Object.hasOwn(chineseNames, genre.name) ? chineseNames[genre.name] : genre.name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readGenres(value: unknown): RestaurantGenre[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const genres = new Map<string, RestaurantGenre>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.code !== "string" || !isGenreCode(item.code) ||
      typeof item.name !== "string" || !item.name.trim() || item.name.length > 100) {
      return null;
    }
    const genre = { code: item.code, name: item.name.trim() };
    const previous = genres.get(genre.code);
    if (previous && previous.name !== genre.name) return null;
    genres.set(genre.code, genre);
  }

  return [...genres.values()];
}

export function readHotPepperGenres(value: unknown): RestaurantGenre[] | null {
  if (!isRecord(value) || !isRecord(value.results) || value.results.error) return null;
  return readGenres(value.results.genre);
}

export function readGenreSearchResult(value: unknown): RestaurantGenre[] | null {
  if (!isRecord(value) || value.ok !== true) return null;
  return readGenres(value.genres);
}
