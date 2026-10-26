"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { REGULAR_RESTAURANTS_KEY, readRegularRestaurants, updateRegularRestaurants, type RegularUpdate, type RegularUpdateResult } from "./regular-restaurants";

const CHANGE_EVENT = "what-to-eat-nearby-regular-change";

function subscribe(onChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === REGULAR_RESTAURANTS_KEY || event.key === null) onChange();
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
    return window.localStorage.getItem(REGULAR_RESTAURANTS_KEY);
  } catch {
    return false;
  }
}

function getServerSnapshot(): undefined {
  return undefined;
}

export default function useRegularRestaurants() {
  const text = useSyncExternalStore<string | null | false | undefined>(subscribe, getSnapshot, getServerSnapshot);
  const entries = useMemo(() => typeof text === "string" || text === null ? readRegularRestaurants(text) : null, [text]);
  const [saveError, setSaveError] = useState("");
  const error = text === false
    ? "当前浏览器无法读取常吃清单，请检查网站的本地存储权限。"
    : text !== undefined && entries === null
      ? "常吃清单暂时无法读取，原数据未改动。"
      : saveError;

  function reload() {
    setSaveError("");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  function update(change: RegularUpdate): RegularUpdateResult {
    let result: RegularUpdateResult;
    try {
      result = updateRegularRestaurants(window.localStorage, change);
    } catch {
      result = { ok: false, message: "当前浏览器无法保存常吃清单，请检查网站的本地存储权限后重试。" };
    }
    setSaveError(result.ok ? "" : result.message);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return result;
  }

  return { entries: entries ?? [], isLoading: text === undefined, canEdit: entries !== null, error, reload, update };
}
