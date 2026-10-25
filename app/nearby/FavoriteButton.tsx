"use client";

import { useLanguage } from "@/app/components/LanguageProvider";

import { useState } from "react";
import type { FavoriteUpdateResult } from "./favorites";
import type { Restaurant } from "./restaurants";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";

export type FavoriteControls = {
  savedIds: ReadonlySet<string>;
  canSave: boolean;
  onToggle: (restaurant: Restaurant) => FavoriteUpdateResult;
};

export default function FavoriteButton({ restaurant, controls }: { restaurant: Restaurant; controls: FavoriteControls }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const isSaved = controls.savedIds.has(restaurant.id);
  return (
    <div>
      <button
        type="button"
        className={styles.favoriteButton}
        aria-pressed={isSaved}
        aria-label={t(isSaved ? "取消收藏 {name}" : "收藏 {name}", { name: restaurant.name })}
        disabled={!controls.canSave}
        onClick={() => {
          const result = controls.onToggle(restaurant);
          setError(result.ok ? "" : result.message);
        }}
      >
        {isSaved ? t("★ 已收藏") : t("☆ 收藏这家")}
      </button>
      {error && <p className={sharedStyles.error} role="alert">{t(error)}</p>}
    </div>
  );
}
