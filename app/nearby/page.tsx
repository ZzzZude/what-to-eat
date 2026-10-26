"use client";

import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/app/components/LanguageProvider";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "../page.module.css";
import nearbyStyles from "./page.module.css";
import RestaurantResults from "./RestaurantResults";
import ManualLocationSearch from "./ManualLocationSearch";
import GenreSelect from "./GenreSelect";
import FavoriteRestaurants from "./FavoriteRestaurants";
import useRestaurantFavorites from "./useRestaurantFavorites";
import RegularRestaurants from "./RegularRestaurants";
import useRegularRestaurants from "./useRegularRestaurants";
import { genreLabel, type RestaurantGenre } from "./genres";
import type { PlaceCandidate, SearchLocation } from "./locations";
import { DEFAULT_RESTAURANT_DISPLAY_COUNT, type RestaurantDisplayCount } from "./restaurant-list";
import {
  formatDistance,
  readRestaurantPageResult,
  readSearchErrorMessage,
  restaurantSearchParams,
  type RestaurantSearchSnapshot,
} from "./restaurants";

export default function NearbyPage() {
  const { t, locale } = useLanguage();
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [locationMode, setLocationMode] = useState<"device" | "manual">("device");
  const [isLocating, setIsLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [radius, setRadius] = useState(1000);
  const [genres, setGenres] = useState<RestaurantGenre[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState<RestaurantSearchSnapshot | null>(null);
  const [displayCount, setDisplayCount] = useState<RestaurantDisplayCount>(DEFAULT_RESTAURANT_DISPLAY_COUNT);
  const activeSearch = useRef<AbortController | null>(null);
  const searchSequence = useRef(0);
  const locationSequence = useRef(0);
  const favorites = useRestaurantFavorites();
  const regularList = useRegularRestaurants();
  const [eatingMode, setEatingMode] = useState<"nearby" | "regular" | null>(null);
  // 已有常吃清单时，下次打开直接进入抽选。
  const activeEatingMode = eatingMode ?? (regularList.entries.length > 0 ? "regular" : "nearby");

  useEffect(() => {
    return () => {
      const controller = activeSearch.current;
      activeSearch.current = null;
      controller?.abort();
      locationSequence.current += 1;
    };
  }, []);

  function resetSearch() {
    const controller = activeSearch.current;
    activeSearch.current = null;
    controller?.abort();
    setIsSearching(false);
    setSearchError("");
    setSearchResult(null);
  }

  function clearLocation() {
    locationSequence.current += 1;
    resetSearch();
    setIsLocating(false);
    setErrorMessage("");
    setLocation(null);
  }

  function handleModeChange(mode: "device" | "manual") {
    if (mode === locationMode) return;
    clearLocation();
    setLocationMode(mode);
  }

  function handleManualSelect(place: PlaceCandidate) {
    clearLocation();
    setLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.title,
      source: "manual",
    });
  }

  function handleLocate() {
    if (isLocating) return;
    clearLocation();
    const requestId = locationSequence.current;

    if (!window.isSecureContext) {
      setErrorMessage(
        "定位需要 localhost 或 HTTPS，也可以切换为手动指定地点。"
      );
      return;
    }

    if (!navigator.geolocation) {
      setErrorMessage("当前浏览器不支持定位，可以手动指定地点。");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // 切换到手动指定后，尚未完成的定位不能覆盖已选地点。
        if (locationSequence.current !== requestId) return;
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "当前位置",
          source: "device",
        });
        setIsLocating(false);
      },
      (error) => {
        if (locationSequence.current !== requestId) return;
        let message = "定位失败，请稍后重试。";

        if (error.code === 1) {
          message = "定位未获授权，请检查浏览器和系统的位置权限，或切换为手动指定。";
        } else if (error.code === 2) {
          message = "暂时无法获取位置，请检查定位服务，或手动指定地点。";
        } else if (error.code === 3) {
          message = "获取位置超时，请重试或手动指定地点。";
        }

        setErrorMessage(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location || isLocating || activeSearch.current) return;

    const controller = new AbortController();
    const searchId = ++searchSequence.current;
    activeSearch.current = controller;
    setIsSearching(true);
    setSearchError("");
    setSearchResult(null);

    // 保存本次搜索条件，结果中的范围和距离都使用这一份位置。
    const center = {
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
      locationLabel: location.label,
      locationSource: location.source,
      genreLabel: genres.length > 0 ? genres.map(genreLabel).join("、") : "不限类型",
      genreCodes: genres.map((genre) => genre.code),
    };
    const params = restaurantSearchParams(center);
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`/api/nearby?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data: unknown = await response.json();

      // 更改条件或离开页面后，旧请求即使返回，也不能再写入列表。
      if (activeSearch.current !== controller) return;
      if (controller.signal.aborted) {
        setSearchError("搜索等待超时，请重新查找餐馆。");
        return;
      }

      const result = readRestaurantPageResult(data);
      if (!response.ok || !result) {
        setSearchError(readSearchErrorMessage(data));
        return;
      }

      setSearchResult({ ...result, ...center, searchId });
    } catch {
      if (activeSearch.current !== controller) return;

      setSearchError(controller.signal.aborted
        ? "搜索等待超时，请重新查找餐馆。"
        : "暂时无法获取餐馆数据，请稍后重试。");
    } finally {
      window.clearTimeout(timeoutId);
      if (activeSearch.current === controller) {
        activeSearch.current = null;
        setIsSearching(false);
      }
    }
  }

  return (
    <main className={`${styles.page} ${nearbyStyles.page}`}>
      <div className={styles.content}>
        <LanguageSwitcher />
        <Link href="/" className={`${styles.back} ${nearbyStyles.backLink}`}>{t("← 返回首页")}</Link>

        <header>
          <p className={styles.brand}>{t("今天吃啥")}</p>
          <h1 className={styles.title}>{t("附近吃")}</h1>
          <p className={styles.subtitle}>{t("发现附近的新店，或从常吃的几家里选。")}</p>
        </header>

        <div className={nearbyStyles.modeChoices} role="group" aria-label={t("选择餐馆来源")}>
          <button type="button" className={nearbyStyles.modeButton} aria-pressed={activeEatingMode === "nearby"} aria-controls="nearby-mode-panel" onClick={() => setEatingMode("nearby")}>{t("找附近餐馆")}</button>
          <button type="button" className={nearbyStyles.modeButton} aria-pressed={activeEatingMode === "regular"} aria-controls="regular-mode-panel" onClick={() => setEatingMode("regular")}>{t("常吃清单")}{regularList.entries.length > 0 && <span className={nearbyStyles.modeCount}>{regularList.entries.length}</span>}</button>
        </div>

        <div id="regular-mode-panel" hidden={activeEatingMode !== "regular"}>
          <RegularRestaurants
            list={regularList}
            favorites={favorites.restaurants}
            favoritesLoading={favorites.isLoading}
            favoritesError={favorites.error}
            onReloadFavorites={favorites.reload}
            onFindNearby={() => setEatingMode("nearby")}
          />
        </div>

        <div id="nearby-mode-panel" hidden={activeEatingMode !== "nearby"}>
        <FavoriteRestaurants
          restaurants={favorites.restaurants}
          isLoading={favorites.isLoading}
          error={favorites.error}
          onReload={favorites.reload}
          controls={favorites}
          regularList={regularList}
          onOpenRegular={() => setEatingMode("regular")}
          onAddToRegular={(restaurant) => {
            setEatingMode("nearby");
            return regularList.update({ type: "addFavorite", restaurant });
          }}
        />

        <section className={styles.preview} aria-labelledby="location-title">
          <h2 id="location-title">{t("先确定在哪里吃")}</h2>
          <p>{t("使用当前位置，或手动选择车站、地址和地点。")}</p>

          <div className={nearbyStyles.modeChoices} role="group" aria-label={t("选择位置方式")}>
            <button
              type="button"
              className={nearbyStyles.modeButton}
              aria-pressed={locationMode === "device"}
              onClick={() => handleModeChange("device")}
            >{t("当前位置")}</button>
            <button
              type="button"
              className={nearbyStyles.modeButton}
              aria-pressed={locationMode === "manual"}
              onClick={() => handleModeChange("manual")}
            >{t("手动指定")}</button>
          </div>

          {locationMode === "device" ? (
            <>
              <button
                type="button"
                className={`${styles.submit} ${nearbyStyles.button}`}
                onClick={handleLocate}
                disabled={isLocating}
                aria-busy={isLocating}
              >
                {isLocating ? t("正在定位…") : t("使用当前位置")}
              </button>

              <p className={styles.help} role="status">
                {isLocating
                  ? t("请留意浏览器的位置授权提示，授权后等待定位结果。")
                  : location
                    ? t("位置已获取。")
                    : t("点击按钮后，浏览器可能会询问位置权限。")}
              </p>
              {errorMessage && (
                <p className={styles.error} role="alert">{t(errorMessage)}</p>
              )}
            </>
          ) : (
            <ManualLocationSearch onClearLocation={clearLocation} onSelect={handleManualSelect} />
          )}

          {location && (
            <div className={nearbyStyles.locationSummary}>
              <p><strong>{t("搜索中心：{place}", { place: location.source === "device" ? t("当前位置") : location.label })}</strong></p>
            </div>
          )}
        </section>
        <section className={styles.preview} aria-labelledby="search-title">
          <h2 id="search-title">{t("设置范围和餐饮类型")}</h2>

          <form onSubmit={handleSearch}>
            <div className={nearbyStyles.radiusField}>
              <label className={styles.label} htmlFor="search-radius">{t("搜索半径")}</label>

              <select
                id="search-radius"
                className={styles.input}
                value={radius}
                onChange={(event) => {
                  setRadius(Number(event.target.value));
                  resetSearch();
                }}
              >
                <option value={500}>{t("500 米")}</option>
                <option value={1000}>{t("1 公里")}</option>
                <option value={2000}>{t("2 公里")}</option>
              </select>
            </div>

            <GenreSelect
              value={genres}
              onChange={(selected) => {
                setGenres(selected);
                resetSearch();
              }}
            />

            <p className={styles.help}>{t("以选定地点为中心，按直线距离计算。更改范围或类型后，请重新查找餐馆。")}</p>

            <button
              type="submit"
              className={`${styles.submit} ${nearbyStyles.button}`}
              disabled={!location || isLocating || isSearching}
              aria-busy={isSearching}
            >
              {isSearching ? t("正在查找…") : searchError ? t("重新查找餐馆") : t("查找附近餐馆")}
            </button>
          </form>

          <p className={styles.help} role="status">
            {isSearching
              ? t("正在查找周围 {distance} 内的餐馆，请稍候。", { distance: formatDistance(radius, locale) })
              : !location
                ? locationMode === "manual"
                  ? t("请先搜索并选择一个地点，再查找餐馆。")
                  : t("请先获取当前位置，再查找餐馆。")
                : searchResult
                  ? t("搜索完成，已获取 {count} 家餐馆。", { count: searchResult.restaurants.length })
                  : t("位置已就绪，可以开始查找餐馆。")}
          </p>

          {searchError && (
            <p className={styles.error} role="alert">{t(searchError)}</p>
          )}
        </section>

        {searchResult && (
          <RestaurantResults
            key={searchResult.searchId}
            search={searchResult}
            displayCount={displayCount}
            onDisplayCountChange={setDisplayCount}
            favorites={favorites}
          />
        )}
        </div>

        <footer className={nearbyStyles.attribution}>
          Powered by {" "}
          <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noopener noreferrer">
            {t("ホットペッパーグルメ Webサービス")}
          </a>
          <p>{t("地点数据：")}{" "}
            <a href="https://maps.gsi.go.jp/" target="_blank" rel="noopener noreferrer">{t("国土地理院 地理院地図")}</a>{t("（加工利用）")}</p>
        </footer>
      </div>
    </main>
  );
}
