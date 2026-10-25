"use client";

import { useEffect, useRef, useState } from "react";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";
import RestaurantPicker from "./RestaurantPicker";
import FavoriteButton, { type FavoriteControls } from "./FavoriteButton";
import {
  RESTAURANT_DISPLAY_COUNTS,
  addRestaurantPage,
  createRestaurantList,
  replaceRestaurantList,
  resizeRestaurantList,
  type RestaurantDisplayCount,
  type RestaurantListState,
} from "./restaurant-list";
import {
  distanceInMeters,
  formatDistance,
  readRestaurantPageResult,
  readSearchErrorMessage,
  restaurantDirectionsUrl,
  restaurantSearchParams,
  restaurantSourceUrl,
  type RestaurantSearchSnapshot,
} from "./restaurants";

type Props = {
  search: RestaurantSearchSnapshot;
  displayCount: RestaurantDisplayCount;
  onDisplayCountChange: (count: RestaurantDisplayCount) => void;
  favorites: FavoriteControls;
};

class RestaurantUpdateError extends Error {}

export default function RestaurantResults({ search, displayCount, onDisplayCountChange, favorites }: Props) {
  const [list, setList] = useState(() => createRestaurantList(search, displayCount));
  const [revision, setRevision] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<RestaurantDisplayCount | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeUpdate = useRef<AbortController | null>(null);
  const canReplace = list.remaining.length > 0 || list.nextStart !== null;
  const isUpdating = isReplacing || pendingCount !== null;

  useEffect(() => () => {
    const controller = activeUpdate.current;
    activeUpdate.current = null;
    controller?.abort();
  }, []);

  async function loadNextPage(state: RestaurantListState, controller: AbortController): Promise<RestaurantListState> {
    if (state.nextStart === null) return state;
    const start = state.nextStart;
    const response = await fetch(`/api/nearby?${restaurantSearchParams(search, start)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (activeUpdate.current !== controller || controller.signal.aborted) throw new Error("Update cancelled");
    const page = readRestaurantPageResult(data, start);
    if (!response.ok || !page) throw new RestaurantUpdateError(readSearchErrorMessage(data));
    return addRestaurantPage(state, page);
  }

  async function handleDisplayCount(count: RestaurantDisplayCount) {
    if (activeUpdate.current) return;
    if (count === displayCount && (list.restaurants.length >= count || !canReplace)) return;
    const controller = new AbortController();
    activeUpdate.current = controller;
    setPendingCount(count);
    setMessage("");
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      let updated = list;
      const needed = Math.max(0, count - list.restaurants.length);
      while (updated.remaining.length < needed && updated.nextStart !== null) {
        updated = await loadNextPage(updated, controller);
      }
      if (activeUpdate.current !== controller) return;
      const resized = resizeRestaurantList(updated, count);
      const changed = resized.restaurants.length !== list.restaurants.length;
      setList(resized);
      onDisplayCountChange(count);
      if (changed) setRevision((current) => current + 1);
      const detail = resized.restaurants.length < count
        ? `已设置最多显示 ${count} 家，当前可显示 ${resized.restaurants.length} 家餐馆。`
        : `现在显示 ${count} 家餐馆。`;
      setMessage(`${detail}${changed ? "抽选已重新开始。" : ""}`);
    } catch (error) {
      if (activeUpdate.current === controller) {
        setError(error instanceof RestaurantUpdateError
          ? `${error.message}原列表和显示家数已保留。`
          : controller.signal.aborted
            ? "调整显示家数超时，原列表已保留，请重试。"
            : "暂时无法调整显示家数，原列表已保留，请稍后重试。");
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeUpdate.current === controller) {
        activeUpdate.current = null;
        setPendingCount(null);
      }
    }
  }

  async function handleReplace(targetId: string | null) {
    if (activeUpdate.current || !canReplace) return;
    const controller = new AbortController();
    activeUpdate.current = controller;
    setIsReplacing(true);
    setReplacingId(targetId);
    setMessage("");
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      let updated = list;
      const needed = targetId === null ? list.restaurants.length : 1;
      if (updated.remaining.length < needed && updated.nextStart !== null) {
        updated = await loadNextPage(updated, controller);
      }

      if (activeUpdate.current !== controller) return;
      const result = replaceRestaurantList(updated, targetId);
      setList(result.state);
      if (result.replaced > 0) {
        setRevision((current) => current + 1);
        const detail = targetId === null
          ? `已替换 ${result.replaced} 家餐馆${result.replaced < needed ? "，其余店铺保留" : ""}。`
          : `已将这家替换为 ${result.state.restaurants.find((item, index) => item.id !== list.restaurants[index].id)?.name}。`;
        setMessage(`${detail}抽选已重新开始。`);
      } else {
        setMessage(updated.nextStart === null
          ? "当前条件下没有其他未显示过的餐馆，列表已保留。可以扩大范围或调整类型后重新查找。"
          : "这批结果中没有新的餐馆，列表已保留，可以再次尝试替换。");
      }
    } catch (error) {
      if (activeUpdate.current === controller) {
        setError(error instanceof RestaurantUpdateError
          ? error.message
          : controller.signal.aborted
            ? "替换等待超时，原列表已保留，请重试。"
            : "暂时无法替换餐馆，原列表已保留，请稍后重试。");
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeUpdate.current === controller) {
        activeUpdate.current = null;
        setIsReplacing(false);
        setReplacingId(null);
      }
    }
  }

  return (
    <>
      {list.restaurants.length > 0 && (
        <nav className={styles.resultNav} aria-label="搜索结果快捷入口">
          <a href="#search-title">调整条件</a>
          <a href="#picker-title">帮我决定</a>
          <a href="#restaurants-title">餐馆列表 · {list.restaurants.length}</a>
        </nav>
      )}
      {list.restaurants.length > 0 && (
        <RestaurantPicker
          key={revision}
          restaurants={list.restaurants}
          center={search}
          isUpdating={isUpdating}
          favorites={favorites}
        />
      )}
      <section className={styles.results} aria-labelledby="restaurants-title">
        <h2 id="restaurants-title">附近的餐馆</h2>
        <p className={styles.summary}>
          搜索中心：{search.locationLabel}。搜索范围：{formatDistance(search.radius)}。
          餐饮类型：{search.genreLabel}。
          搜索时 Hot Pepper 找到 {search.total} 家，当前显示 {list.restaurants.length} 家。
        </p>
        {list.restaurants.length === 0 ? (
          <div className={styles.emptyState}>
            <p>当前条件下暂未获取到 Hot Pepper 收录的餐馆。</p>
            <p>试试选择不限类型、扩大搜索范围，或更换地点后再查找。</p>
          </div>
        ) : (
          <>
            <div className={styles.listTools}>
              <fieldset className={styles.countFieldset} disabled={isUpdating}>
                <legend className={styles.countLabel}>显示家数</legend>
                <div className={styles.countChoices}>
                  {RESTAURANT_DISPLAY_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={styles.countButton}
                      aria-pressed={displayCount === count}
                      onClick={() => void handleDisplayCount(count)}
                    >{count} 家</button>
                  ))}
                </div>
              </fieldset>
              <p className={sharedStyles.help}>默认 20 家，不足所选家数时按实际数量显示。抽选仅使用当前列表。</p>
              <p className={sharedStyles.help}>
                可以替换单家或换一批；新店沿用本次搜索条件，同次搜索不重复显示已换掉的店。
                替换成功后，抽选重新开始。
              </p>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.replaceButton}`}
                onClick={() => void handleReplace(null)}
                disabled={isUpdating || !canReplace}
              >
                {isReplacing && replacingId === null ? "正在换一批…" : "换一批餐馆"}
              </button>
              {!canReplace && (
                <p className={sharedStyles.help}>当前条件下已没有其他餐馆可替换，可以调整范围或类型后重新查找。</p>
              )}
              <p className={styles.replacementStatus} role="status" aria-atomic="true">
                {pendingCount !== null ? `正在调整为 ${pendingCount} 家，请稍候…`
                  : isReplacing ? "正在查找符合相同条件的其他餐馆…" : message}
              </p>
              {error && <p className={sharedStyles.error} role="alert">{error}</p>}
            </div>
            <p className={sharedStyles.help}>首次优先显示较近的餐馆。以下距离为相对搜索中心的直线估算。</p>
            <ul className={styles.restaurantList}>
              {list.restaurants.map((restaurant, index) => {
                const sourceUrl = restaurantSourceUrl(restaurant.sourceUrl);
                return (
                  <li key={index}>
                    <article className={styles.restaurantCard}>
                      <h3>{restaurant.name}</h3>
                      <div className={styles.meta}>
                        <span>{restaurant.genre || "暂无分类信息"}</span>
                        <span>直线约 {formatDistance(distanceInMeters(search, restaurant))}</span>
                      </div>
                      <p className={styles.address}>{restaurant.address || "暂无地址信息"}</p>
                      <div className={styles.cardActions}>
                        <a
                          className={styles.detailLink}
                          href={restaurantDirectionsUrl(restaurant)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`前往 ${restaurant.name}，在 Google 地图打开步行路线（新窗口）`}
                        >去导航 ↗</a>
                        {sourceUrl && (
                          <a
                            className={styles.detailLink}
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`查看 ${restaurant.name} 的店铺详情（新窗口）`}
                          >查看店铺详情 ↗</a>
                        )}
                      </div>
                      <FavoriteButton key={restaurant.id} restaurant={restaurant} controls={favorites} />
                      <button
                        type="button"
                        className={`${styles.secondaryButton} ${styles.replaceButton}`}
                        disabled={isUpdating || !canReplace}
                        onClick={() => void handleReplace(restaurant.id)}
                        aria-label={`替换 ${restaurant.name}`}
                      >
                        {isReplacing && replacingId === restaurant.id ? "正在替换…" : "替换这家"}
                      </button>
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
