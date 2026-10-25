"use client";

import { useMemo, useSyncExternalStore } from "react";
import { FAVORITES_STORAGE_KEY, readSavedFavorites, toggleSavedFavorite, type FavoriteUpdateResult } from "./favorites";
import type { Restaurant } from "./restaurants";

const CHANGE_EVENT = "what-to-eat-nearby-favorites-change";

function subscribe(onChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === FAVORITES_STORAGE_KEY || event.key === null) onChange();
  }
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): string | null | false {
  try {
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    return false;
  }
}

function getServerSnapshot(): undefined {
  return undefined;
}

export default function useRestaurantFavorites() {
  const text = useSyncExternalStore<string | null | false | undefined>(subscribe, getSnapshot, getServerSnapshot);
  const saved = useMemo(() => typeof text === "string" || text === null ? readSavedFavorites(text) : null, [text]);
  const restaurants = useMemo(() => saved ?? [], [saved]);
  const savedIds = useMemo(() => new Set(restaurants.map((restaurant) => restaurant.id)), [restaurants]);
  const isLoading = text === undefined;
  const error = text === false
    ? "当前浏览器无法读取收藏，请检查网站的本地存储权限。"
    : !isLoading && saved === null
      ? "收藏数据暂时无法读取，原数据未改动。"
      : "";

  function reload() {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  function onToggle(restaurant: Restaurant): FavoriteUpdateResult {
    let result: FavoriteUpdateResult;
    try {
      result = toggleSavedFavorite(window.localStorage, restaurant);
    } catch {
      result = { ok: false, message: "当前浏览器无法保存收藏，请检查网站的本地存储权限。" };
    }
    // 即使写入失败，也刷新其他标签页可能已修改的内容。
    reload();
    return result;
  }

  return { restaurants, savedIds, isLoading, error, canSave: !isLoading && saved !== null, onToggle, reload };
}
