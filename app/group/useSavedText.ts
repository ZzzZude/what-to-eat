"use client";

import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "what-to-eat-storage-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getServerSnapshot(): null {
  return null;
}

export default function useSavedText(
  key: string,
  initialValue = ""
) {
  const savedValue = useSyncExternalStore(
    subscribe,
    () => readText(key),
    getServerSnapshot
  );

  function setValue(nextValue: string) {
    try {
      window.localStorage.setItem(key, nextValue);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      window.alert(
        "当前浏览器无法保存数据，请检查是否允许此网站使用本地存储。"
      );
    }
  }

  return [savedValue ?? initialValue, setValue] as const;
}