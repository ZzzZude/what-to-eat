/* eslint-disable @typescript-eslint/no-require-imports -- 此 .cjs 脚本使用 CommonJS 运行本地数据检查，不访问外部接口。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function loadUtilities(relativeFile, dependencies = {}) {
  const file = path.join(__dirname, relativeFile);
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  });
  const utilities = {};
  new Function("exports", "require", compiled.outputText)(utilities, (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected test dependency: ${name}`);
  });
  return utilities;
}

const utilities = loadUtilities("../app/nearby/restaurants.ts");
const locations = loadUtilities("../app/nearby/locations.ts");
const locationsRoute = loadUtilities("../app/api/locations/route.ts", {
  "@/app/nearby/locations": locations,
});
const genres = loadUtilities("../app/nearby/genres.ts");
const genreService = loadUtilities("../lib/hotpepper/genres.ts", {
  "server-only": {},
  "@/app/nearby/genres": genres,
});
const genreRoute = loadUtilities("../app/api/nearby/genres/route.ts", {
  "@/lib/hotpepper/genres": genreService,
});
const nearbyRoute = loadUtilities("../app/api/nearby/route.ts", {
  "@/app/nearby/genres": genres,
  "@/lib/hotpepper/genres": genreService,
  "@/app/nearby/restaurants": utilities,
});
const restaurantList = loadUtilities("../app/nearby/restaurant-list.ts");
const favorites = loadUtilities("../app/nearby/favorites.ts", { "./restaurants": utilities });
const {
  isValidPlaceQuery,
  normalizePlaceQuery,
  placeMapUrl,
  readGsiPlaces,
  readPlaceSearchError,
  readPlaceSearchResult,
} = locations;

const {
  distanceInMeters,
  formatDistance,
  readRestaurantSearchResult,
  readRestaurantPageResult,
  restaurantSearchParams,
  readSearchErrorMessage,
  pickRestaurant,
  restaurantDirectionsUrl,
  restaurantSourceUrl,
} = utilities;

const restaurant = {
  id: "test-restaurant",
  name: "测试餐馆",
  address: "测试地址",
  latitude: 35.68,
  longitude: 139.76,
  genre: "测试分类",
  sourceUrl: "https://www.hotpepper.jp/strTEST/",
};

test("区分服务中匹配的总数与本次显示的餐馆数", () => {
  const result = readRestaurantSearchResult({ ok: true, total: 45, restaurants: [restaurant] });
  assert.equal(result.total, 45);
  assert.equal(result.restaurants.length, 1);
});

test("零结果也是有效的搜索结果", () => {
  assert.deepEqual(readRestaurantSearchResult({ ok: true, total: 0, restaurants: [] }), {
    total: 0, restaurants: [],
  });
});

test("同一家店只显示一次，顺序保持不变", () => {
  const other = { ...restaurant, id: "other" };
  const result = readRestaurantSearchResult({
    ok: true, total: 2, restaurants: [restaurant, other, restaurant],
  });
  assert.deepEqual(result.restaurants.map((item) => item.id), [restaurant.id, other.id]);
});

test("无效的结果、计数和餐馆信息不能进入列表", () => {
  for (const value of [null, {}, { ok: false },
    { ok: true, total: -1, restaurants: [] },
    { ok: true, total: "1", restaurants: [restaurant] },
    { ok: true, total: 0, restaurants: [restaurant] }]) {
    assert.equal(readRestaurantSearchResult(value), null);
  }

  for (const bad of [null, { ...restaurant, id: "" },
    { ...restaurant, latitude: null }, { ...restaurant, latitude: NaN },
    { ...restaurant, latitude: 91 }, { ...restaurant, longitude: -181 },
    { ...restaurant, name: " " }]) {
    assert.equal(readRestaurantSearchResult({ ok: true, total: 1, restaurants: [bad] }), null);
  }
});

test("详情链接只接受安全的 Hot Pepper 地址", () => {
  assert.equal(restaurantSourceUrl(restaurant.sourceUrl), restaurant.sourceUrl);
  for (const value of ["", "javascript:alert(1)", "http://www.hotpepper.jp/",
    "https://hotpepper.jp.example.com/", "https://example.com/",
    "https://user:password@www.hotpepper.jp/", "https://www.hotpepper.jp:8443/"]) {
    assert.equal(restaurantSourceUrl(value), null);
  }
});

test("接口失败信息可展示，缺少信息时提供中文提示", () => {
  assert.equal(readSearchErrorMessage({ ok: false, message: " 搜索失败 " }), "搜索失败");
  assert.equal(readSearchErrorMessage(null), "餐馆数据暂时无法读取，请稍后重试。");
});

test("直线距离在同一点、跨日期变更线和相对地点都能正确计算", () => {
  const origin = { latitude: 0, longitude: 0 };
  assert.equal(distanceInMeters(origin, origin), 0);
  const oneDegree = distanceInMeters(origin, { latitude: 0, longitude: 1 });
  assert.ok(Math.abs(oneDegree - 111195) < 2);
  const acrossDateLine = distanceInMeters(
    { latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }
  );
  assert.ok(acrossDateLine > 22000 && acrossDateLine < 23000);
  assert.ok(Number.isFinite(distanceInMeters(origin, { latitude: 0, longitude: 180 })));
});

test("距离按米或公里显示，边界值可读", () => {
  assert.equal(formatDistance(0), "0 米");
  assert.equal(formatDistance(480), "480 米");
  assert.equal(formatDistance(999.8), "1.0 公里");
  assert.equal(formatDistance(1000), "1.0 公里");
  assert.equal(formatDistance(2050), "2.0 公里");
});

test("没有候选或本轮已选完时，不会继续随机选择", () => {
  const shouldNotRun = () => { throw new Error("这里不应调用随机函数"); };
  assert.equal(pickRestaurant([], [], shouldNotRun), null);
  assert.equal(pickRestaurant([restaurant], [restaurant.id], shouldNotRun), null);
});

test("一轮内不重复，重新开始后可以再次选中上一轮的餐馆", () => {
  const candidates = [restaurant, { ...restaurant, id: "second" }, { ...restaurant, id: "third" }];
  const originalIds = candidates.map((item) => item.id);
  const chosen = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const next = pickRestaurant(candidates, chosen, () => 0);
    assert.ok(next);
    assert.equal(chosen.includes(next.id), false);
    chosen.push(next.id);
  }

  assert.equal(new Set(chosen).size, candidates.length);
  assert.equal(pickRestaurant(candidates, chosen), null);
  assert.equal(pickRestaurant(candidates, [], () => 0.99).id, chosen[chosen.length - 1]);
  assert.deepEqual(candidates.map((item) => item.id), originalIds);
});

test("只有一家餐馆时可以选中，之后本轮结束", () => {
  assert.equal(pickRestaurant([restaurant], [], () => 0.99).id, restaurant.id);
  assert.equal(pickRestaurant([restaurant], [restaurant.id]), null);
});

test("重复店铺不增加抽中机会，已经选过的店铺不会再次出现", () => {
  const other = { ...restaurant, id: "other" };
  const candidates = [restaurant, restaurant, other];
  assert.equal(pickRestaurant(candidates, [], () => 0.49).id, restaurant.id);
  assert.equal(pickRestaurant(candidates, [], () => 0.5).id, other.id);
  assert.equal(pickRestaurant(candidates, [restaurant.id], () => 0).id, other.id);
});

test("导航链接以店铺坐标为终点并指定步行路线", () => {
  const url = new URL(restaurantDirectionsUrl(restaurant));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("destination"), "35.68,139.76");
  assert.equal(url.searchParams.get("travelmode"), "walking");
  assert.equal(url.searchParams.get("dir_action"), "navigate");
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(url.searchParams.has("key"), false);
});

test("导航链接保留负数坐标，店名和地址不会被拼成额外参数", () => {
  const url = new URL(restaurantDirectionsUrl({
    ...restaurant,
    latitude: -33.86,
    longitude: 151.2,
    name: "测试&origin=other",
    address: "测试?key=other",
  }));
  assert.equal(url.searchParams.get("destination"), "-33.86,151.2");
  assert.equal(url.searchParams.size, 4);
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(url.searchParams.has("key"), false);
});

function feature(title, latitude = 35.68, longitude = 139.76) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { title },
  };
}

test("地点输入统一全角字符、空格和车站后缀", () => {
  assert.equal(normalizePlaceQuery("　新宿站　"), "新宿駅");
  assert.equal(normalizePlaceQuery("東京都　 千代田区丸の内１丁目"), "東京都 千代田区丸の内1丁目");
});

test("地点输入限制长度并拒绝控制字符", () => {
  assert.equal(isValidPlaceQuery("新宿駅"), true);
  assert.equal(isValidPlaceQuery("あ".repeat(100)), true);
  for (const value of ["", "あ", "あ".repeat(101), "新宿\u0000駅", "新宿\u007f駅"]) {
    assert.equal(isValidPlaceQuery(value), false);
  }
});

test("地图库坐标按正确顺序读取，并清除重复或无效候选", () => {
  const point = feature("東京駅");
  const places = readGsiPlaces([point, point, null, feature("坏坐标", 100), feature(" ")], "東京駅");
  assert.equal(places.length, 1);
  assert.equal(places[0].latitude, 35.68);
  assert.equal(places[0].longitude, 139.76);
  assert.equal(places[0].title, "東京駅");
});

test("车站检索不把行政区当车站，精确结果在截取候选前优先", () => {
  const noise = Array.from({ length: 20 }, (_, index) => feature(`同名地区${index}`));
  const places = readGsiPlaces([
    ...noise, feature("西新宿駅"), feature("新宿駅南口郵便局"), feature("新宿駅"),
  ], "新宿駅");
  assert.deepEqual(places.map((place) => place.title), ["新宿駅", "西新宿駅"]);
  assert.deepEqual(readGsiPlaces([feature("東京都新宿区")], "東京都新宿駅"), []);

  const generalPlaces = readGsiPlaces([...noise, feature("公園")], "公園");
  assert.equal(generalPlaces[0].title, "公園");
  assert.equal(generalPlaces.length, 10);
});

test("地点检索区分无结果与上游数据错误", () => {
  assert.deepEqual(readGsiPlaces([], "新宿駅"), []);
  assert.equal(readGsiPlaces({ error: "failed" }, "新宿駅"), null);
  assert.equal(readGsiPlaces([null, {}], "新宿駅"), null);
});

test("页面接收地点数据时验证坐标，并拒绝错误响应", () => {
  const places = readGsiPlaces([feature("新宿駅")], "新宿駅");
  assert.deepEqual(readPlaceSearchResult({ ok: true, places: [...places, ...places] }), places);
  assert.deepEqual(readPlaceSearchResult({ ok: true, places: [] }), []);
  assert.equal(readPlaceSearchResult({ ok: false, places }), null);
  assert.equal(readPlaceSearchResult({ ok: true, places: [{ ...places[0], latitude: null }] }), null);
});

test("地点检索失败时提供地点相关的中文提示", () => {
  assert.equal(readPlaceSearchError({ message: " 检索失败 " }), "检索失败");
  assert.equal(readPlaceSearchError(null), "地点检索暂时不可用，请稍后重试或使用当前位置。");
});

test("候选地点的地图确认链接指向对应坐标", () => {
  const url = new URL(placeMapUrl({ latitude: 35.68, longitude: 139.76 }));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "35.68,139.76");
});

test("地点接口拒绝缺少或过长的查询，不调用上游服务", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("不应调用上游服务"); });
  for (const query of ["", "あ", "あ".repeat(101)]) {
    const request = new Request(`https://localhost/api/locations?q=${encodeURIComponent(query)}`);
    const response = await locationsRoute.GET(request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("地点接口将规范化的查询交给固定服务，并返回正确位置", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin, "https://msearch.gsi.go.jp");
    assert.equal(url.searchParams.get("q"), "新宿駅");
    return Response.json([feature("東京都新宿区"), feature("新宿駅")]);
  });
  const response = await locationsRoute.GET(new Request(
    `https://localhost/api/locations?q=${encodeURIComponent("　新宿站　")}`
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.places.length, 1);
  assert.equal(body.places[0].title, "新宿駅");
  assert.equal(body.places[0].latitude, 35.68);
});

test("地点接口把服务失败和数据错误作为失败返回，空结果仍成功", async (t) => {
  let makeResponse = () => Response.json([]);
  t.mock.method(globalThis, "fetch", async () => makeResponse());
  const request = new Request("https://localhost/api/locations?q=新宿駅");
  let response = await locationsRoute.GET(request);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).places, []);

  for (const factory of [
    () => new Response(null, { status: 503 }),
    () => Response.json({ unexpected: true }),
    () => new Response("not json"),
    () => { throw new Error("simulated network timeout"); },
  ]) {
    makeResponse = factory;
    response = await locationsRoute.GET(request);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, false);
  }
});

const genreFixture = [
  { code: "G013", name: "ラーメン" },
  { code: "G004", name: "和食" },
];

function useTestKey(t, key = "nearby-test-key") {
  const previous = process.env.HOTPEPPER_API_KEY;
  if (key === null) delete process.env.HOTPEPPER_API_KEY;
  else process.env.HOTPEPPER_API_KEY = key;
  t.after(() => {
    if (previous === undefined) delete process.env.HOTPEPPER_API_KEY;
    else process.env.HOTPEPPER_API_KEY = previous;
  });
}

function nearbyRequest(query = "") {
  return new Request(`https://localhost/api/nearby?lat=35.68&lng=139.76&radius=1000${query}`);
}

function shopResponse() {
  return Response.json({ results: { results_available: 1, shop: [{
    id: restaurant.id, name: restaurant.name, address: restaurant.address,
    lat: restaurant.latitude, lng: restaurant.longitude,
    genre: { name: "ラーメン" }, urls: { pc: restaurant.sourceUrl },
  }] } });
}

test("分类来自官方目录，去重后保留顺序，并提供中文名称", () => {
  assert.deepEqual(genres.readHotPepperGenres({ results: {
    genre: [...genreFixture, genreFixture[0]],
  } }), genreFixture);
  assert.equal(genres.genreLabel(genreFixture[0]), "拉面");
  assert.equal(genres.genreLabel({ code: "G999", name: "新分类" }), "新分类");
  assert.equal(genres.genreLabel({ code: "G999", name: "constructor" }), "constructor");
  assert.deepEqual(genres.readGenreSearchResult({ ok: true, genres: genreFixture }), genreFixture);
});

test("分类目录拒绝空列表、错误响应、无效代码及同码异名", () => {
  for (const value of [null, {}, { results: { genre: [] } },
    { results: { error: [{ code: "2000" }], genre: genreFixture } },
    { results: { genre: [{ code: "G013,G004", name: "错误" }] } },
    { results: { genre: [{ code: "G013", name: " " }] } },
    { results: { genre: [genreFixture[0], { code: "G013", name: "不同名称" }] } }]) {
    assert.equal(genres.readHotPepperGenres(value), null);
  }
  assert.equal(genres.readGenreSearchResult({ ok: false, genres: genreFixture }), null);
  for (const value of ["", "g013", "G13", "G013,G004", "G013&key=other", "G013\n"]) {
    assert.equal(genres.isGenreCode(value), false);
  }
});

test("分类接口只向固定服务请求目录，响应不暴露 Key", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://webservice.recruit.co.jp");
    assert.equal(url.pathname, "/hotpepper/genre/v1/");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("key"), "nearby-test-key");
    assert.equal(options.redirect, "error");
    return Response.json({ results: { genre: genreFixture } });
  });
  const response = await genreRoute.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, { ok: true, genres: genreFixture });
  assert.equal(JSON.stringify(body).includes("nearby-test-key"), false);
});

test("分类读取失败、错误格式及 HTTP 200 内的错误都可重试且不泄漏异常", async (t) => {
  useTestKey(t);
  let makeResponse;
  t.mock.method(globalThis, "fetch", async () => makeResponse());
  for (const factory of [
    () => new Response(null, { status: 503 }),
    () => Response.json({ results: { error: [{ code: "2000", message: "nearby-test-key" }] } }),
    () => Response.json({ results: { genre: [] } }),
    () => new Response("invalid json"),
    () => { throw new Error("upstream url?key=nearby-test-key"); },
  ]) {
    makeResponse = factory;
    const response = await genreRoute.GET();
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes("nearby-test-key"), false);
  }
  makeResponse = () => Response.json({ results: { genre: genreFixture } });
  assert.equal((await genreRoute.GET()).status, 200);
});

test("缺少 Key 时返回配置错误，不访问外部服务", async (t) => {
  useTestKey(t, null);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("不应请求服务"); });
  assert.equal((await genreRoute.GET()).status, 503);
  assert.equal((await nearbyRoute.GET(nearbyRequest("&genre=G013"))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
});

test("不限类型直接搜索餐馆，不依赖分类目录", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.pathname, "/hotpepper/gourmet/v1/");
    assert.equal(url.searchParams.has("genre"), false);
    return shopResponse();
  });
  const response = await nearbyRoute.GET(nearbyRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).restaurants.length, 1);
  assert.equal(fetch.mock.callCount(), 1);
});

test("选定类型先复核目录，再向搜索服务传递分类、范围和坐标", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname === "/hotpepper/genre/v1/") {
      return Response.json({ results: { genre: genreFixture } });
    }
    assert.equal(url.origin, "https://webservice.recruit.co.jp");
    assert.equal(url.pathname, "/hotpepper/gourmet/v1/");
    assert.equal(url.searchParams.get("genre"), "G013");
    assert.equal(url.searchParams.get("lat"), "35.68");
    assert.equal(url.searchParams.get("lng"), "139.76");
    assert.equal(url.searchParams.get("range"), "3");
    assert.equal(url.searchParams.get("count"), "20");
    assert.equal(url.searchParams.get("order"), "1");
    return shopResponse();
  });
  const response = await nearbyRoute.GET(nearbyRequest("&genre=G013"));
  assert.equal(response.status, 200);
  const result = readRestaurantSearchResult(await response.json());
  assert.equal(result.total, 1);
  assert.equal(result.restaurants[0].id, restaurant.id);
  assert.equal(fetch.mock.callCount(), 2);
});

test("非法分类及空值混合的分类在本地拒绝，不调用服务", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("不应请求服务"); });
  for (const query of ["&genre=other", "&genre=G013,other", "&genre=G013&genre=", "&genre=G013,,G004"]) {
    assert.equal((await nearbyRoute.GET(nearbyRequest(query))).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("多选类型支持逗号或重复参数、去重，空选择为不限", () => {
  assert.deepEqual(genres.readGenreCodes([]), []);
  assert.deepEqual(genres.readGenreCodes([""]), []);
  assert.deepEqual(genres.readGenreCodes(["G013,G004", "G013"]), ["G013", "G004"]);
  assert.deepEqual(genres.readGenreCodes(["G013", "G004"]), ["G013", "G004"]);
  assert.equal(genres.readGenreCodes(["G013", ""]), null);
  assert.equal(genres.readGenreCodes(Array(31).fill("G013")), null);
});

test("多选类型合并传给服务，任意一个无效类型都不能放宽为全部", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname === "/hotpepper/genre/v1/") {
      return Response.json({ results: { genre: genreFixture } });
    }
    assert.equal(url.searchParams.get("genre"), "G013,G004");
    return shopResponse();
  });
  for (const query of ["&genre=G013,G004", "&genre=G013&genre=G004&genre=G013"]) {
    assert.equal((await nearbyRoute.GET(nearbyRequest(query))).status, 200);
  }
  const callsBefore = fetch.mock.callCount();
  assert.equal((await nearbyRoute.GET(nearbyRequest("&genre=G013,G999"))).status, 400);
  assert.equal(fetch.mock.callCount(), callsBefore + 1);
});

function restaurantItems(start, count) {
  return Array.from({ length: count }, (_, index) => ({ ...restaurant, id: `shop-${start + index}` }));
}

function providerPage(start, count, total) {
  return { results: { results_available: total, shop: restaurantItems(start, count).map((item) => ({
    id: item.id, name: item.name, address: item.address,
    lat: item.latitude, lng: item.longitude, genre: { name: item.genre }, urls: { pc: item.sourceUrl },
  })) } };
}

test("分页搜索使用正确起点，末页和空结果没有后续页", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async (url) => {
    const start = Number(url.searchParams.get("start"));
    const count = Math.max(0, Math.min(20, 45 - start + 1));
    return Response.json(providerPage(start, count, 45));
  });
  for (const [start, nextStart, count] of [[1, 21, 20], [21, 41, 20], [41, null, 5], [46, null, 0]]) {
    const response = await nearbyRoute.GET(nearbyRequest(`&start=${start}`));
    assert.equal(response.status, 200);
    const page = readRestaurantPageResult(await response.json(), start);
    assert.ok(page);
    assert.equal(page.nextStart, nextStart);
    assert.equal(page.restaurants.length, count);
  }
});

test("无效分页位置在本地拒绝，不调用服务", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("不应请求服务"); });
  for (const start of ["", "0", "-1", "1.5", "NaN", "1e3", "1000001"]) {
    assert.equal((await nearbyRoute.GET(nearbyRequest(`&start=${start}`))).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("分页游标按原始返回条数前进，重复餐馆只返回一次", async (t) => {
  useTestKey(t);
  t.mock.method(globalThis, "fetch", async () => {
    const data = providerPage(1, 20, 45);
    data.results.shop[1] = data.results.shop[0];
    return Response.json(data);
  });
  const response = await nearbyRoute.GET(nearbyRequest());
  const page = readRestaurantPageResult(await response.json());
  assert.equal(page.restaurants.length, 19);
  assert.equal(page.nextStart, 21);
});

test("上游空坐标或异常类型不能被转换成 0 后用于导航", async (t) => {
  useTestKey(t);
  let payload;
  t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  for (const field of ["lat", "lng"]) {
    for (const value of [null, "", " ", false, true, [], [35.68], {}, "north", "0x23", undefined]) {
      payload = providerPage(1, 1, 1);
      payload.results.shop[0][field] = value;
      const response = await nearbyRoute.GET(nearbyRequest());
      assert.equal(response.status, 502, `${field} 的无效坐标应被拒绝：${JSON.stringify(value)}`);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(Object.hasOwn(body, "restaurants"), false);
    }
  }
});

test("有效数字和完整的十进制坐标字符串保持原值，真实的 0 坐标仍有效", async (t) => {
  useTestKey(t);
  let payload;
  t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  for (const [lat, lng, expectedLat, expectedLng] of [
    [35.68, 139.76, 35.68, 139.76],
    ["35.680000", "139.760000", 35.68, 139.76],
    [" -33.86 ", "+151.20", -33.86, 151.2],
    [0, "0", 0, 0],
  ]) {
    payload = providerPage(1, 1, 1);
    payload.results.shop[0].lat = lat;
    payload.results.shop[0].lng = lng;
    const response = await nearbyRoute.GET(nearbyRequest());
    assert.equal(response.status, 200);
    const page = readRestaurantPageResult(await response.json());
    assert.equal(page.restaurants[0].latitude, expectedLat);
    assert.equal(page.restaurants[0].longitude, expectedLng);
  }
});

test("坐标异常的搜索可以在相同条件下重试恢复，不缓存失败响应", async (t) => {
  useTestKey(t);
  let payload = providerPage(1, 1, 1);
  payload.results.shop[0].lat = null;
  t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  const failed = await nearbyRoute.GET(nearbyRequest());
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("Cache-Control"), "no-store");
  payload = providerPage(1, 1, 1);
  const restored = await nearbyRoute.GET(nearbyRequest());
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).restaurants.length, 1);
});

test("错误游标或不完整的分页响应不能写入列表", () => {
  const valid = { ok: true, total: 45, restaurants: [restaurant], start: 1, nextStart: 21 };
  assert.ok(readRestaurantPageResult(valid));
  for (const value of [{ ...valid, start: 21 }, { ...valid, nextStart: 1 },
    { ...valid, nextStart: 22 }, { ...valid, nextStart: "21" },
    { ...valid, nextStart: undefined }, { ...valid, restaurants: [] },
    { ...valid, restaurants: restaurantItems(1, 21) }]) {
    assert.equal(readRestaurantPageResult(value), null);
  }
});

test("替换请求保留地点、半径和所有已选类型，仅改变分页起点", () => {
  const conditions = { latitude: 35.68, longitude: 139.76, radius: 500, genreCodes: ["G013", "G004"] };
  const first = restaurantSearchParams(conditions);
  const next = restaurantSearchParams(conditions, 21);
  assert.equal(first.get("start"), "1");
  assert.equal(next.get("start"), "21");
  for (const key of ["lat", "lng", "radius", "genre"]) assert.equal(next.get(key), first.get(key));
  assert.equal(next.get("genre"), "G013,G004");
  assert.equal(next.has("key"), false);
});

test("换单家只修改目标位置，其余 19 家保留，列表不重复", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 });
  const available = restaurantList.addRestaurantPage(initial, { total: 45, restaurants: restaurantItems(21, 20), nextStart: 41 });
  const result = restaurantList.replaceRestaurantList(available, "shop-5");
  assert.equal(result.replaced, 1);
  assert.equal(result.state.restaurants[4].id, "shop-21");
  assert.equal(result.state.restaurants.length, 20);
  assert.equal(new Set(result.state.restaurants.map((item) => item.id)).size, 20);
  assert.equal(result.state.remaining.length, 19);
  for (let index = 0; index < 20; index += 1) {
    if (index !== 4) assert.equal(result.state.restaurants[index].id, initial.restaurants[index].id);
  }
  assert.equal(initial.restaurants[4].id, "shop-5");
  assert.equal(available.remaining.length, 20);
});

test("分页与已移出列表的店铺去重，换掉的店不会再次回来", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 });
  const available = restaurantList.addRestaurantPage(initial, { total: 45, restaurants: restaurantItems(19, 4), nextStart: 23 });
  assert.deepEqual(available.remaining.map((item) => item.id), ["shop-21", "shop-22"]);
  const changed = restaurantList.replaceRestaurantList(available, "shop-1").state;
  const more = restaurantList.addRestaurantPage(changed, { total: 45, restaurants: [initial.restaurants[0], ...restaurantItems(22, 2)], nextStart: 25 });
  assert.deepEqual(more.remaining.map((item) => item.id), ["shop-22", "shop-23"]);
  assert.equal(more.remaining.some((item) => item.id === "shop-1"), false);
});

test("换一批支持全量及不足 20 家时的部分替换，保持列表数量", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 });
  const available = restaurantList.addRestaurantPage(initial, { total: 45, restaurants: restaurantItems(21, 20), nextStart: 41 });
  const changed = restaurantList.replaceRestaurantList(available, null);
  assert.equal(changed.replaced, 20);
  assert.deepEqual(changed.state.restaurants.map((item) => item.id), restaurantItems(21, 20).map((item) => item.id));
  const last = restaurantList.addRestaurantPage(changed.state, { total: 45, restaurants: restaurantItems(41, 5), nextStart: null });
  const partial = restaurantList.replaceRestaurantList(last, null);
  assert.equal(partial.replaced, 5);
  assert.equal(partial.state.restaurants.length, 20);
  assert.equal(partial.state.nextStart, null);
  assert.equal(partial.state.remaining.length, 0);
  const exhausted = restaurantList.replaceRestaurantList(partial.state, "shop-41");
  assert.equal(exhausted.replaced, 0);
  assert.deepEqual(exhausted.state, partial.state);
});

test("显示家数仅支持 5、10、15、20，未指定时默认 20 家", () => {
  const page = { total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 };
  assert.deepEqual(restaurantList.RESTAURANT_DISPLAY_COUNTS, [5, 10, 15, 20]);
  assert.equal(restaurantList.DEFAULT_RESTAURANT_DISPLAY_COUNT, 20);
  assert.equal(restaurantList.createRestaurantList(page).restaurants.length, 20);
  for (const count of [5, 10, 15, 20]) {
    const list = restaurantList.createRestaurantList(page, count);
    assert.equal(list.restaurants.length, count);
    assert.equal(list.remaining.length, 20 - count);
    assert.equal(list.nextStart, 21);
  }
});

test("减少家数后再增加，恢复原来的顺序且不重复，不改写原名单", () => {
  const original = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 });
  let list = restaurantList.resizeRestaurantList(original, 10);
  list = restaurantList.resizeRestaurantList(list, 5);
  for (const count of [10, 15, 20]) {
    list = restaurantList.resizeRestaurantList(list, count);
    assert.deepEqual(list.restaurants.map((item) => item.id), restaurantItems(1, count).map((item) => item.id));
    assert.equal(new Set([...list.restaurants, ...list.remaining].map((item) => item.id)).size, 20);
  }
  assert.deepEqual(list, original);
  assert.equal(original.restaurants.length, 20);
  assert.equal(original.remaining.length, 0);
});

test("缩小列表再替换单家，增加家数时不会恢复已经换掉的店", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 }, 5);
  const changed = restaurantList.replaceRestaurantList(initial, "shop-1").state;
  assert.equal(changed.restaurants[0].id, "shop-6");
  assert.equal(changed.restaurants.length, 5);
  const available = restaurantList.addRestaurantPage(changed, { total: 45, restaurants: restaurantItems(21, 20), nextStart: 41 });
  const expanded = restaurantList.resizeRestaurantList(available, 20);
  assert.equal(expanded.restaurants.length, 20);
  assert.equal(expanded.restaurants[0].id, "shop-6");
  assert.equal(expanded.restaurants.some((item) => item.id === "shop-1"), false);
  assert.equal(new Set(expanded.restaurants.map((item) => item.id)).size, 20);
});

test("5 家列表换一批只换 5 家，扩大后仍不会恢复被换掉的整批店铺", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 }, 5);
  const result = restaurantList.replaceRestaurantList(initial, null);
  assert.equal(result.replaced, 5);
  assert.equal(result.state.restaurants.length, 5);
  assert.deepEqual(result.state.restaurants.map((item) => item.id), restaurantItems(6, 5).map((item) => item.id));
  const expanded = restaurantList.resizeRestaurantList(result.state, 15);
  assert.deepEqual(expanded.restaurants.map((item) => item.id), restaurantItems(6, 15).map((item) => item.id));
});

test("餐馆不足所选家数时显示实际数量，暂时收起的店铺仍能补回", () => {
  const initial = restaurantList.createRestaurantList({ total: 7, restaurants: restaurantItems(1, 7), nextStart: null });
  const smaller = restaurantList.resizeRestaurantList(initial, 5);
  assert.equal(smaller.restaurants.length, 5);
  assert.equal(smaller.remaining.length, 2);
  const expanded = restaurantList.resizeRestaurantList(smaller, 15);
  assert.equal(expanded.restaurants.length, 7);
  assert.equal(expanded.nextStart, null);
  assert.equal(expanded.remaining.length, 0);
  assert.deepEqual(expanded.restaurants, initial.restaurants);
});

test("同一次搜索之外的新搜索可以沿用选择的家数，并开始新的名单", () => {
  const first = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 }, 10);
  const second = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(101, 20), nextStart: 21 }, 10);
  assert.equal(second.restaurants.length, 10);
  assert.equal(second.restaurants.some((item) => first.seenIds.includes(item.id)), false);
  assert.equal(second.remaining.length, 10);
});

test("非法显示家数不能改变名单", () => {
  const initial = restaurantList.createRestaurantList({ total: 45, restaurants: restaurantItems(1, 20), nextStart: 21 });
  for (const count of [0, -5, 6, 25, NaN]) {
    assert.throws(() => restaurantList.resizeRestaurantList(initial, count), RangeError);
  }
  assert.equal(initial.restaurants.length, 20);
  assert.equal(initial.remaining.length, 0);
});

function favoriteStorage(initial = null) {
  let text = initial;
  let writes = 0;
  return {
    getItem(key) {
      assert.equal(key, favorites.FAVORITES_STORAGE_KEY);
      return text;
    },
    setItem(key, value) {
      assert.equal(key, favorites.FAVORITES_STORAGE_KEY);
      text = value;
      writes += 1;
    },
    text: () => text,
    writes: () => writes,
  };
}

test("没有本机收藏与空收藏均有效，保存后可以重新读取", () => {
  assert.deepEqual(favorites.readSavedFavorites(null), []);
  assert.deepEqual(favorites.readSavedFavorites(JSON.stringify({ version: 1, restaurants: [] })), []);
  const storage = favoriteStorage();
  const result = favorites.toggleSavedFavorite(storage, restaurant);
  assert.equal(result.ok, true);
  assert.equal(result.added, true);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()), [restaurant]);
});

test("收藏按店铺 ID 去重，再次点击可取消，取消后可重新收藏", () => {
  const storage = favoriteStorage();
  favorites.toggleSavedFavorite(storage, restaurant);
  const removed = favorites.toggleSavedFavorite(storage, { ...restaurant, name: "更新后的同一家店" });
  assert.equal(removed.ok, true);
  assert.equal(removed.added, false);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()), []);
  const restored = favorites.toggleSavedFavorite(storage, restaurant);
  assert.equal(restored.added, true);
  assert.equal(restored.restaurants.length, 1);
});

test("收藏最新的店排在前面，取消某家不影响其他店铺", () => {
  const storage = favoriteStorage();
  const other = { ...restaurant, id: "other" };
  favorites.toggleSavedFavorite(storage, restaurant);
  favorites.toggleSavedFavorite(storage, other);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()).map((item) => item.id), ["other", restaurant.id]);
  favorites.toggleSavedFavorite(storage, restaurant);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()), [other]);
});

test("本机收藏读取时去重并清除无关字段，详情链接仍需安全检查", () => {
  const saved = favorites.readSavedFavorites(JSON.stringify({ version: 1, restaurants: [
    restaurant, { ...restaurant, searchCenter: { latitude: 1, longitude: 2 }, apiKey: "test-only-value" },
  ] }));
  assert.deepEqual(saved, [restaurant]);
  const storage = favoriteStorage();
  const result = favorites.toggleSavedFavorite(storage, {
    ...restaurant,
    sourceUrl: "javascript:alert(1)",
    searchCenter: { latitude: 1, longitude: 2 },
    apiKey: "test-only-value",
  });
  assert.equal(result.ok, true);
  const data = JSON.parse(storage.text());
  assert.equal(data.restaurants[0].sourceUrl, "");
  assert.equal(data.restaurants[0].latitude, restaurant.latitude);
  assert.equal(Object.hasOwn(data.restaurants[0], "searchCenter"), false);
  assert.equal(storage.text().includes("test-only-value"), false);
});

test("损坏、未知版本或坐标无效的收藏不被覆盖", () => {
  for (const value of ["not json", "null", "[]", "{}",
    JSON.stringify({ version: 2, restaurants: [restaurant] }),
    JSON.stringify({ version: 1, restaurants: [{ ...restaurant, latitude: null }] }),
    JSON.stringify({ version: 1, restaurants: [{ ...restaurant, longitude: 181 }] }),
    JSON.stringify({ version: 1, restaurants: [{ ...restaurant, name: " " }] })]) {
    assert.equal(favorites.readSavedFavorites(value), null);
    const storage = favoriteStorage(value);
    assert.equal(favorites.toggleSavedFavorite(storage, restaurant).ok, false);
    assert.equal(storage.writes(), 0);
    assert.equal(storage.text(), value);
  }
});

test("无效餐馆不能写入收藏，已有收藏保持不变", () => {
  const storage = favoriteStorage(JSON.stringify({ version: 1, restaurants: [restaurant] }));
  for (const bad of [{ ...restaurant, id: "" }, { ...restaurant, latitude: NaN }]) {
    assert.equal(favorites.toggleSavedFavorite(storage, bad).ok, false);
  }
  assert.equal(storage.writes(), 0);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()), [restaurant]);
});

test("浏览器拒绝读取或写入时返回中文错误，不误报保存成功", () => {
  const original = JSON.stringify({ version: 1, restaurants: [restaurant] });
  const error = new Error("storage failure test-only-private-value");
  for (const storage of [
    { getItem() { throw error; }, setItem() { throw new Error("不应写入"); } },
    { getItem() { return original; }, setItem() { throw error; } },
  ]) {
    const result = favorites.toggleSavedFavorite(storage, { ...restaurant, id: "other" });
    assert.equal(result.ok, false);
    assert.match(result.message, /浏览器无法保存收藏/);
    assert.equal(result.message.includes("test-only-private-value"), false);
  }
});

test("修改收藏前重新读取，保留其他标签页刚刚加入的店铺", () => {
  const storage = favoriteStorage();
  const other = { ...restaurant, id: "other" };
  favorites.toggleSavedFavorite(storage, restaurant);
  storage.setItem(favorites.FAVORITES_STORAGE_KEY, JSON.stringify({ version: 1, restaurants: [other, restaurant] }));
  const third = { ...restaurant, id: "third" };
  favorites.toggleSavedFavorite(storage, third);
  assert.deepEqual(favorites.readSavedFavorites(storage.text()).map((item) => item.id), ["third", "other", restaurant.id]);
});

test("替换页的上游错误不被误认成末页，且错误信息不暴露 Key", async (t) => {
  useTestKey(t);
  let factory;
  t.mock.method(globalThis, "fetch", async () => factory());
  for (const makeResponse of [
    () => Response.json({ results: { error: [{ code: "2000", message: "nearby-test-key" }] } }),
    () => Response.json({ results: { results_available: 45, shop: [] } }),
    () => new Response(null, { status: 503 }),
    () => { throw new Error("key=nearby-test-key"); },
  ]) {
    factory = makeResponse;
    const response = await nearbyRoute.GET(nearbyRequest("&start=21"));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(JSON.stringify(body).includes("nearby-test-key"), false);
  }
});

test("目录不包含的分类或目录读取失败时，不会静默变成不限类型", async (t) => {
  useTestKey(t);
  let makeResponse = () => Response.json({ results: { genre: genreFixture } });
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.pathname, "/hotpepper/genre/v1/");
    return makeResponse();
  });
  assert.equal((await nearbyRoute.GET(nearbyRequest("&genre=G999"))).status, 400);
  makeResponse = () => new Response(null, { status: 503 });
  assert.equal((await nearbyRoute.GET(nearbyRequest("&genre=G013"))).status, 502);
});
