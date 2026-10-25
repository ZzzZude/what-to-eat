/* eslint-disable @typescript-eslint/no-require-imports -- Run translations and source coverage checks without network or database access. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.join(__dirname, "..");

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  });
  const result = {};
  new Function("exports", "require", compiled.outputText)(result, (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  });
  return result;
}

const catalog = load("lib/i18n/messages.ts");
const { translate, message, readLocale, localeCookie, LOCALE_COOKIE } = load("lib/i18n/index.ts", { "./messages": catalog });
const { formatDistance } = load("app/nearby/restaurants.ts");
const { genreLabel } = load("app/nearby/genres.ts");
const placeholders = (value) => [...new Set(value.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort();

test("invalid language preferences fall back to Chinese", () => {
  for (const value of [undefined, null, "", "fr", "en; Path=/", "constructor", {}]) assert.equal(readLocale(value), "zh");
  for (const locale of ["zh", "ja", "en"]) assert.equal(readLocale(locale), locale);
});

test("every translation preserves all dynamic values", () => {
  for (const [key, translations] of Object.entries(catalog.messages)) {
    for (const text of translations) {
      assert.ok(text.trim(), key);
      assert.deepEqual(placeholders(text), placeholders(key), key);
    }
  }
});

test("changing languages translates existing structured notices without changing user content", () => {
  const name = "房主 {count} <店名>";
  const notice = message("{detail}{restart}", {
    detail: message("已将这家替换为 {name}。", { name }),
    restart: message("抽选已重新开始。"),
  });
  assert.equal(translate("en", notice), `Replaced this restaurant with ${name}. A new draw round has started.`);
  assert.equal(translate("ja", notice), `このお店を${name}に入れ替えました。抽選を新しいラウンドにリセットしました。`);
  assert.equal(translate("zh", notice), `已将这家替换为 ${name}。抽选已重新开始。`);
  assert.equal(translate("en", "你好，{name}！", { name: "房主" }), "Hello, 房主!");
});

test("language preference uses a separate one-year cookie and HTTPS adds Secure", () => {
  const local = localeCookie("ja", false);
  assert.equal(local, `${LOCALE_COOKIE}=ja; Path=/; Max-Age=31536000; SameSite=Lax`);
  assert.equal(localeCookie("en", true), `${LOCALE_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
});

test("distance units and provider categories follow the selected language", () => {
  assert.equal(formatDistance(999.6, "zh"), "1.0 公里");
  assert.equal(formatDistance(999.6, "ja"), "1.0 km");
  assert.equal(formatDistance(120, "en"), "120 m");
  assert.equal(translate("en", genreLabel({ code: "G013", name: "ラーメン" })), "Ramen");
  assert.equal(translate("ja", genreLabel({ code: "G013", name: "ラーメン" })), "ラーメン");
});

function filesIn(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

test("all UI message keys have Japanese and English and JSX has no untranslated Chinese copy", () => {
  for (const file of filesIn("app").filter((file) => file.endsWith(".tsx"))) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ["t", "message", "textMessage"].includes(node.expression.getText(source))) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key) && key.text) assert.ok(Object.hasOwn(catalog.messages, key.text), `${file}: ${key.text}`);
      }
      if (ts.isJsxText(node)) assert.ok(!/[\p{Script=Han}]/u.test(node.text), `${file}: ${node.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("all known API errors and saved-favorite errors have translations", () => {
  const files = [
    ...filesIn("app/api").filter((file) => !file.includes("/health/")),
    ...filesIn("lib/rooms"), ...filesIn("lib/supabase"), ...filesIn("lib/hotpepper"),
    "app/nearby/favorites.ts", "app/nearby/useRestaurantFavorites.ts",
  ];
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteral(node) && /[\p{Script=Han}]/u.test(node.text)) assert.ok(Object.hasOwn(catalog.messages, node.text), `${file}: ${node.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
