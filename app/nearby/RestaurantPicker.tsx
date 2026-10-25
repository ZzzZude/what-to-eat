"use client";

import { useState } from "react";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";
import FavoriteButton, { type FavoriteControls } from "./FavoriteButton";
import {
  distanceInMeters,
  formatDistance,
  pickRestaurant,
  restaurantDirectionsUrl,
  restaurantSourceUrl,
  type Coordinates,
  type Restaurant,
} from "./restaurants";

type Props = {
  restaurants: readonly Restaurant[];
  center: Coordinates;
  isUpdating?: boolean;
  favorites: FavoriteControls;
};

export default function RestaurantPicker({ restaurants, center, isUpdating = false, favorites }: Props) {
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const selectedId = chosenIds[chosenIds.length - 1];
  const selected = restaurants.find((restaurant) => restaurant.id === selectedId);
  const remainingCount = restaurants.length - chosenIds.length;
  const sourceUrl = selected ? restaurantSourceUrl(selected.sourceUrl) : null;

  function handleChoose() {
    // 随机选择只在点击时发生，状态更新只负责记录结果。
    const next = pickRestaurant(restaurants, chosenIds);
    if (!next) return;

    setChosenIds((current) => current.includes(next.id) ? current : [...current, next.id]);
  }

  return (
    <section className={styles.picker} aria-labelledby="picker-title">
      <h2 id="picker-title">帮我决定</h2>
      <p className={styles.pickerDescription}>
        {restaurants.length === 1
          ? "当前列表只有 1 家餐馆，可以选中它查看路线，或扩大范围重新查找。"
          : `从当前列表的 ${restaurants.length} 家餐馆中随机选一家，同一轮不重复。`}
      </p>

      <div className={styles.chooseActions}>
        <button
          type="button"
          className={`${sharedStyles.submit} ${styles.button} ${styles.chooseButton}`}
          onClick={handleChoose}
          disabled={isUpdating || remainingCount === 0}
        >
          {selected ? "换一家" : "帮我选一家"}
        </button>

        {chosenIds.length > 0 && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setChosenIds([])}
            disabled={isUpdating}
          >
            重新开始一轮
          </button>
        )}
      </div>

      <p className={styles.drawStatus} role="status" aria-atomic="true">
        {selected
          ? remainingCount === 0
            ? `已选中 ${selected.name}。本轮 ${restaurants.length} 家已全部选过，可以重新开始一轮，或调整范围重新搜索。`
            : `已选中 ${selected.name}。本轮已选 ${chosenIds.length} 家，还有 ${remainingCount} 家未选过。`
          : "点击“帮我选一家”，开始这一轮。"}
      </p>

      {selected && (
        <article className={styles.selectedCard}>
          <p className={styles.selectedLabel}>这顿就吃这家？</p>
          <h3>{selected.name}</h3>
          <div className={styles.meta}>
            <span>{selected.genre || "暂无分类信息"}</span>
            <span>直线约 {formatDistance(distanceInMeters(center, selected))}</span>
          </div>
          <p className={styles.address}>{selected.address || "暂无地址信息"}</p>
          <FavoriteButton key={selected.id} restaurant={selected} controls={favorites} />

          <a
            className={styles.navigationLink}
            href={restaurantDirectionsUrl(selected)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`前往 ${selected.name}，在 Google 地图打开步行路线（新窗口）`}
          >
            就吃这家，去导航 ↗
          </a>
          <p className={styles.navigationHint}>在 Google 地图中打开步行路线，起点可在地图中调整。</p>

          {sourceUrl && (
            <a className={styles.detailLink} href={sourceUrl} target="_blank" rel="noopener noreferrer">
              查看店铺详情 ↗
            </a>
          )}
        </article>
      )}
    </section>
  );
}
