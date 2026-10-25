"use client";

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
  const [error, setError] = useState("");
  const isSaved = controls.savedIds.has(restaurant.id);
  return (
    <div>
      <button
        type="button"
        className={styles.favoriteButton}
        aria-pressed={isSaved}
        aria-label={`${isSaved ? "取消收藏" : "收藏"} ${restaurant.name}`}
        disabled={!controls.canSave}
        onClick={() => {
          const result = controls.onToggle(restaurant);
          setError(result.ok ? "" : result.message);
        }}
      >
        {isSaved ? "★ 已收藏" : "☆ 收藏这家"}
      </button>
      {error && <p className={sharedStyles.error} role="alert">{error}</p>}
    </div>
  );
}
