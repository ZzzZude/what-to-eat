"use client";

import { useLanguage } from "@/app/components/LanguageProvider";

import { useEffect, useRef, useState, type FormEvent } from "react";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";
import {
  isValidPlaceQuery,
  normalizePlaceQuery,
  placeMapUrl,
  readPlaceSearchError,
  readPlaceSearchResult,
  type PlaceCandidate,
} from "./locations";

type Props = {
  onClearLocation: () => void;
  onSelect: (place: PlaceCandidate) => void;
};

export default function ManualLocationSearch({ onClearLocation, onSelect }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFinding, setIsFinding] = useState(false);
  const [error, setError] = useState("");
  const activeLookup = useRef<AbortController | null>(null);
  const queryInput = useRef<HTMLInputElement | null>(null);
  const changeButton = useRef<HTMLButtonElement | null>(null);
  const selected = places?.find((place) => place.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    if (isExpanded) queryInput.current?.focus();
    else changeButton.current?.focus();
  }, [selected, isExpanded]);

  useEffect(() => {
    return () => {
      const controller = activeLookup.current;
      activeLookup.current = null;
      controller?.abort();
    };
  }, []);

  function resetLookup() {
    const controller = activeLookup.current;
    activeLookup.current = null;
    controller?.abort();
    setIsFinding(false);
    setError("");
    setPlaces(null);
    setSelectedId(null);
    onClearLocation();
  }

  async function handleFind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeLookup.current) return;

    const text = normalizePlaceQuery(query);
    if (!isValidPlaceQuery(text)) {
      setError("请输入 2～100 个字符的地点名称或日本地址。");
      return;
    }

    resetLookup();
    setQuery(text);
    const controller = new AbortController();
    activeLookup.current = controller;
    setIsFinding(true);
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const params = new URLSearchParams({ q: text });
      const response = await fetch(`/api/locations?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (activeLookup.current !== controller) return;
      if (controller.signal.aborted) {
        setError("地点检索等待超时，请重试。");
        return;
      }

      const candidates = readPlaceSearchResult(data);
      if (!response.ok || !candidates) {
        setError(readPlaceSearchError(data));
        return;
      }
      setPlaces(candidates);
    } catch {
      if (activeLookup.current !== controller) return;
      setError(controller.signal.aborted
        ? "地点检索等待超时，请重试。"
        : "暂时无法检索地点，请稍后重试或使用当前位置。");
    } finally {
      window.clearTimeout(timeoutId);
      if (activeLookup.current === controller) {
        activeLookup.current = null;
        setIsFinding(false);
      }
    }
  }

  if (selected && !isExpanded) {
    return (
      <div className={styles.manualSearch}>
        <p className={sharedStyles.help} role="status">{t("地点已确认，可以继续设置范围和餐饮类型。")}</p>
        <div className={styles.placeActions}>
          <button ref={changeButton} type="button" className={styles.placeButton} onClick={() => setIsExpanded(true)}>{t("更换地点")}</button>
          <a
            className={styles.detailLink}
            href={placeMapUrl(selected)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("在 Google 地图确认 {name} 的位置（新窗口）", { name: selected.title })}
          >{t("地图确认 ↗")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.manualSearch}>
      <form onSubmit={handleFind}>
        <label className={sharedStyles.label} htmlFor="place-query">{t("车站、地址或地点")}</label>
        <input
          ref={queryInput}
          id="place-query"
          className={sharedStyles.input}
          value={query}
          minLength={2}
          maxLength={100}
          required
          autoComplete="off"
          placeholder={t("例如：新宿駅、東京都千代田区丸の内")}
          aria-describedby="place-help"
          onChange={(event) => {
            setQuery(event.target.value);
            resetLookup();
          }}
        />
        <p id="place-help" className={sharedStyles.help}>{t("建议使用日文名称。点击搜索后使用国土地理院检索，再由你确认具体位置。")}</p>
        <button
          type="submit"
          className={`${sharedStyles.submit} ${styles.button}`}
          disabled={isFinding || query.trim().length < 2}
          aria-busy={isFinding}
        >
          {isFinding ? t("正在检索地点…") : error ? t("重新搜索地点") : t("搜索地点")}
        </button>
      </form>

      <p className={sharedStyles.help} role="status">
        {isFinding
          ? t("正在查找地点，请稍候。")
          : selected
            ? t("已选择 {name}，现在可以查找附近餐馆。", { name: selected.title })
            : places
              ? places.length > 0
                ? t("本次显示 {count} 个候选，请核对名称或地图，并选择一个搜索中心。", { count: places.length })
                : t("没有找到匹配地点。车站可先只输入日文站名，如 新宿駅；地址可填写得更具体。")
              : t("输入地点并搜索，再从候选中选择一个搜索中心。")}
      </p>
      {error && <p className={sharedStyles.error} role="alert">{t(error)}</p>}

      {selected && (
        <button type="button" className={styles.placeButton} onClick={() => setIsExpanded(false)}>{t("保留当前地点并收起")}</button>
      )}

      {places && places.length > 0 && (
        <ul className={styles.placeCandidates} aria-label={t("候选地点")}>
          {places.map((place, index) => (
            <li key={place.id} className={styles.placeCandidate}>
              <p className={styles.placeTitle}>{place.title}</p>
              <p className={styles.placeHint}>{t("候选位置 {count} · 请核对地图", { count: index + 1 })}</p>
              <div className={styles.placeActions}>
                <button
                  type="button"
                  className={styles.placeButton}
                  disabled={selectedId === place.id}
                  aria-label={t("以 {name}（候选位置 {count}）为搜索中心", { name: place.title, count: index + 1 })}
                  onClick={() => {
                    setSelectedId(place.id);
                    onSelect(place);
                    setIsExpanded(false);
                  }}
                >
                  {selectedId === place.id ? t("已设为搜索中心") : t("以这里为中心")}
                </button>
                <a
                  className={styles.detailLink}
                  href={placeMapUrl(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("在 Google 地图确认 {name}（候选位置 {count}）的位置（新窗口）", { name: place.title, count: index + 1 })}
                >{t("地图确认 ↗")}</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
