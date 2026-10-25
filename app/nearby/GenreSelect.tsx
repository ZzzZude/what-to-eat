"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import nearbyStyles from "./page.module.css";
import { genreLabel, readGenreSearchResult, type RestaurantGenre } from "./genres";

type Props = {
  value: RestaurantGenre[];
  onChange: (genres: RestaurantGenre[]) => void;
};

export default function GenreSelect({ value, onChange }: Props) {
  const [genres, setGenres] = useState<RestaurantGenre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    async function loadGenres() {
      try {
        const response = await fetch("/api/nearby/genres", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        const result = readGenreSearchResult(data);
        if (!response.ok || !result || controller.signal.aborted) throw new Error("Genre lookup failed");
        if (active) setGenres(result);
      } catch {
        if (active) setError("餐饮类型暂时无法读取。你可以先用“不限类型”查找，或重试。");
      } finally {
        window.clearTimeout(timeout);
        if (active) setIsLoading(false);
      }
    }

    void loadGenres();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  return (
    <div className={nearbyStyles.radiusField}>
      <fieldset className={nearbyStyles.genreFieldset} disabled={isLoading || genres.length === 0} aria-describedby="genre-help">
        <legend className={styles.label}>想吃什么类型</legend>
        <p className={styles.help}>可选一种或多种，匹配其中任意一种；都不选表示不限。</p>
        <div className={nearbyStyles.genreChoices}>
          <label className={nearbyStyles.genreChoice}>
            <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} />
            <span>不限类型</span>
          </label>
          {genres.map((genre) => (
            <label key={genre.code} className={nearbyStyles.genreChoice}>
              <input
                type="checkbox"
                checked={value.some((selected) => selected.code === genre.code)}
                onChange={(event) => onChange(event.target.checked
                  ? [...value, genre]
                  : value.filter((selected) => selected.code !== genre.code))}
              />
              <span>{genreLabel(genre)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={nearbyStyles.genreSummary} role="status">
        {value.length > 0 ? `已选：${value.map(genreLabel).join("、")}` : "当前：不限类型"}
      </p>
      <p id="genre-help" className={styles.help} role="status">
        {isLoading ? "正在读取餐饮类型，可先按不限类型查找。" : error ||
          "按 Hot Pepper 的主分类或副分类匹配，店铺卡片显示主分类。"}
      </p>
      {error && (
        <button
          type="button"
          className={nearbyStyles.retryButton}
          onClick={() => {
            setError("");
            setIsLoading(true);
            setAttempt((current) => current + 1);
          }}
        >
          重新读取类型
        </button>
      )}
    </div>
  );
}
