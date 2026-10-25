"use client";

import { useLanguage } from "@/app/components/LanguageProvider";
import { genreLabel } from "./genres";

import { useRef } from "react";
import FavoriteButton, { type FavoriteControls } from "./FavoriteButton";
import { restaurantDirectionsUrl, restaurantSourceUrl, type Restaurant } from "./restaurants";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";

type Props = {
  restaurants: readonly Restaurant[];
  isLoading: boolean;
  error: string;
  onReload: () => void;
  controls: FavoriteControls;
};

export default function FavoriteRestaurants({ restaurants, isLoading, error, onReload, controls }: Props) {
  const { t } = useLanguage();
  const summary = useRef<HTMLElement | null>(null);
  const panelControls: FavoriteControls = {
    ...controls,
    onToggle(restaurant) {
      const result = controls.onToggle(restaurant);
      // 取消后卡片会消失，焦点回到仍然可见的收藏入口。
      if (result.ok && !result.added) summary.current?.focus();
      return result;
    },
  };
  return (
    <div className={styles.favoritesSection}>
      <details className={styles.favoritesPanel}>
        <summary ref={summary} className={styles.favoritesSummary}>
          <h2>{!isLoading && !error ? t("我的收藏 · {count} 家", { count: restaurants.length }) : t("我的收藏")}</h2>
        </summary>
        <p className={sharedStyles.help}>{t("无需登录，仅保存在当前浏览器，不跨设备同步。清除网站数据会移除收藏。")}</p>
        {isLoading ? (
          <p className={sharedStyles.help} role="status">{t("正在读取收藏…")}</p>
        ) : !error && restaurants.length === 0 ? (
          <p className={styles.favoritesEmpty}>{t("还没有收藏。在餐馆列表或抽选结果中点击“收藏这家”，下次可以直接从这里查看。")}</p>
        ) : !error && (
          <>
            <p className={sharedStyles.help}>{t("以下为收藏时的店铺信息，营业情况可打开店铺详情确认。")}</p>
            <ul className={styles.favoriteList} aria-label={t("收藏的餐馆")}>
              {restaurants.map((restaurant) => {
                const sourceUrl = restaurantSourceUrl(restaurant.sourceUrl);
                return (
                  <li key={restaurant.id}>
                    <article className={styles.restaurantCard}>
                      <h3>{restaurant.name}</h3>
                      <p className={styles.meta}>{restaurant.genre ? t(genreLabel({ code: "", name: restaurant.genre })) : t("暂无分类信息")}</p>
                      <p className={styles.address}>{restaurant.address || t("暂无地址信息")}</p>
                      <div className={styles.cardActions}>
                        <a
                          className={styles.detailLink}
                          href={restaurantDirectionsUrl(restaurant)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("前往 {name}，在 Google 地图打开步行路线（新窗口）", { name: restaurant.name })}
                        >{t("去导航 ↗")}</a>
                        {sourceUrl && (
                          <a
                            className={styles.detailLink}
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("查看 {name} 的店铺详情（新窗口）", { name: restaurant.name })}
                          >{t("查看店铺详情 ↗")}</a>
                        )}
                      </div>
                      <FavoriteButton restaurant={restaurant} controls={panelControls} />
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </details>
      {error && (
        <div className={styles.favoritesError}>
          <p className={sharedStyles.error} role="alert">{t(error)}</p>
          <button type="button" className={styles.retryButton} onClick={onReload}>{t("重新读取收藏")}</button>
        </div>
      )}
    </div>
  );
}
