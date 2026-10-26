"use client";

import { useRef, useState, type FormEvent, type Ref } from "react";
import { useLanguage } from "@/app/components/LanguageProvider";
import { message, type TranslationInput } from "@/lib/i18n";
import { isRegularRestaurant, pickRegularRestaurant, type RegularRestaurant } from "./regular-restaurants";
import { restaurantDirectionsUrl, restaurantSourceUrl, type Restaurant } from "./restaurants";
import type useRegularRestaurants from "./useRegularRestaurants";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";

type Props = {
  list: ReturnType<typeof useRegularRestaurants>;
  favorites: readonly Restaurant[];
  favoritesLoading: boolean;
  favoritesError: string;
  onReloadFavorites: () => void;
  onFindNearby: () => void;
};

export default function RegularRestaurants({ list, favorites, favoritesLoading, favoritesError, onReloadFavorites, onFindNearby }: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<TranslationInput>("");
  const listTitle = useRef<HTMLHeadingElement>(null);
  const drawButton = useRef<HTMLButtonElement>(null);
  const participants = list.entries.filter((entry) => entry.included);

  function addNames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = list.update({ type: "addNames", text: draft });
    if (!result.ok) {
      setNotice("");
      return;
    }
    setDraft("");
    setIsAdding(false);
    window.requestAnimationFrame(() => drawButton.current?.focus());
    setNotice(result.added > 0
      ? message("已加入 {count} 家，重复店名已自动跳过。", { count: result.added })
      : message("这些店已经在清单里了，不会重复加入。"));
  }

  return (
    <section aria-label={t("常吃清单")}>
      <div className={styles.regularIntro}>
        <h2>{t("熟悉的几家，直接选")}</h2>
        <p className={sharedStyles.help}>{t("存好想吃的店，每次打开直接抽。今天不想吃的，取消勾选就好。")}</p>
      </div>

      {list.isLoading ? <p className={sharedStyles.help} role="status">{t("正在读取常吃清单…")}</p> : (
        <>
          {list.entries.length > 0 && <RegularDraw key={JSON.stringify(participants)} entries={participants} disabled={!list.canEdit} buttonRef={drawButton} />}

          <section className={sharedStyles.preview} aria-labelledby="regular-list-title">
            <div className={styles.regularListHeading}>
              <h2 id="regular-list-title" ref={listTitle} tabIndex={-1}>{t("我的店铺 · {count} 家", { count: list.entries.length })}</h2>
              {list.entries.length > 0 && (
                <button type="button" className={styles.textButton} onClick={() => setIsAdding(!isAdding)} aria-expanded={isAdding} aria-controls="regular-add-form">
                  {isAdding ? t("收起添加") : t("＋ 添加店名")}
                </button>
              )}
            </div>

            {(list.entries.length === 0 || isAdding) && (
              <form id="regular-add-form" onSubmit={addNames} className={styles.regularAddForm}>
                <label htmlFor="regular-names" className={sharedStyles.label}>{t("想吃的店名")}</label>
                <textarea
                  id="regular-names"
                  className={`${sharedStyles.input} ${styles.regularTextarea}`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("例如：一兰 新宿店\n寿司郎 新宿东口店\n公司楼下的定食店")}
                  rows={3}
                  maxLength={10000}
                  disabled={!list.canEdit}
                  aria-describedby="regular-add-help"
                />
                <p id="regular-add-help" className={sharedStyles.help}>{t("一行一家，也可用逗号分隔；只填店名就能抽，分店建议写清位置。")}</p>
                <button type="submit" className={`${sharedStyles.submit} ${styles.button} ${styles.regularAddButton}`} disabled={!list.canEdit || !draft.trim()}>{t("保存并加入抽选")}</button>
              </form>
            )}

            {list.entries.length > 0 && (
              <>
                <div className={styles.regularListHeading}>
                  <p className={styles.regularCount}>{t("参与抽选 {selected} / {total} 家", { selected: participants.length, total: list.entries.length })}</p>
                  <button type="button" className={styles.textButton} disabled={!list.canEdit || participants.length === list.entries.length} onClick={() => { setNotice(""); list.update({ type: "includeAll" }); }}>{t("全部参与")}</button>
                </div>
                <ul className={styles.regularList} aria-label={t("选择参与抽选的店铺")}>
                  {list.entries.map((entry) => (
                    <li key={entry.id} className={styles.regularRow}>
                      <label className={styles.regularChoice}>
                        <input type="checkbox" aria-label={entry.name} checked={entry.included} disabled={!list.canEdit} onChange={(event) => { setNotice(""); list.update({ type: "include", id: entry.id, included: event.target.checked }); }} />
                        <span>
                          <strong>{entry.name}</strong>
                          <span className={styles.regularRowHint}>{entry.included ? t("参与抽选") : t("暂不参与")}</span>
                        </span>
                      </label>
                      <button type="button" className={styles.textButton} disabled={!list.canEdit} aria-label={t("从常吃清单移除 {name}", { name: entry.name })} onClick={() => {
                        const result = list.update({ type: "remove", id: entry.id });
                        if (result.ok) {
                          setNotice(message("已移除 {name}。", { name: entry.name }));
                          listTitle.current?.focus();
                        }
                      }}>{t("移除")}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <details className={styles.regularImport}>
              <summary className={styles.favoritesSummary}>{t("从我的收藏加入")}</summary>
              {favoritesLoading ? <p className={sharedStyles.help}>{t("正在读取收藏…")}</p> : favoritesError ? (
                <>
                  <p className={sharedStyles.error} role="alert">{t(favoritesError)}</p>
                  <button type="button" className={styles.retryButton} onClick={onReloadFavorites}>{t("重新读取收藏")}</button>
                </>
              ) : favorites.length === 0 ? (
                <>
                  <p className={sharedStyles.help}>{t("还没有收藏。可以先填写店名，也可以查找附近餐馆后收藏。")}</p>
                  <button type="button" className={styles.textButton} onClick={onFindNearby}>{t("去找附近餐馆 →")}</button>
                </>
              ) : (
                <ul className={styles.regularList}>
                  {favorites.map((restaurant) => {
                    const added = isRegularRestaurant(list.entries, restaurant);
                    return (
                      <li key={restaurant.id} className={styles.regularImportRow}>
                        <span>{restaurant.name}</span>
                        <button type="button" className={styles.textButton} disabled={!list.canEdit || added} aria-label={t("将 {name} 加入常吃清单", { name: restaurant.name })} onClick={() => {
                          const result = list.update({ type: "addFavorite", restaurant });
                          if (result.ok) setNotice(message("已将 {name} 加入常吃清单。", { name: restaurant.name }));
                        }}>{added ? t("已加入") : t("加入")}</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
            <p className={sharedStyles.help}>{t("清单和勾选仅保存在当前浏览器，下次打开仍保留；清除网站数据后会移除。")}</p>
          </section>
        </>
      )}

      <p className={styles.regularNotice} role="status">{notice ? t(notice) : ""}</p>
      {list.error && (
        <div>
          <p className={sharedStyles.error} role="alert">{t(list.error)}</p>
          <button type="button" className={styles.retryButton} onClick={list.reload}>{t("重新读取常吃清单")}</button>
        </div>
      )}
    </section>
  );
}

function RegularDraw({ entries, disabled, buttonRef }: { entries: readonly RegularRestaurant[]; disabled: boolean; buttonRef: Ref<HTMLButtonElement> }) {
  const { t } = useLanguage();
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const selected = entries.find((entry) => entry.id === chosenIds.at(-1));
  const remaining = entries.length - chosenIds.length;
  const sourceUrl = selected?.restaurant ? restaurantSourceUrl(selected.restaurant.sourceUrl) : null;

  function choose(restart = false) {
    const next = pickRegularRestaurant(entries, restart ? [] : chosenIds);
    if (next) setChosenIds(restart ? [next.id] : [...chosenIds, next.id]);
  }

  return (
    <section className={styles.picker} aria-labelledby="regular-draw-title">
      <h2 id="regular-draw-title">{t("今天就从这 {count} 家里选", { count: entries.length })}</h2>
      <p className={styles.pickerDescription}>{entries.length === 0 ? t("先在下面添加店名，或勾选想吃的店。") : t("每家机会相同，换一家时本轮不重复。修改参与店铺后重新开始。")}</p>
      <button ref={buttonRef} type="button" className={`${sharedStyles.submit} ${styles.button}`} disabled={disabled || entries.length === 0} onClick={() => choose(remaining === 0)}>
        {remaining === 0 && selected ? t("重新抽一轮") : selected ? t("换一家") : t("帮我选一家")}
      </button>
      {selected && (
        <>
          <article className={styles.selectedCard}>
            <p className={styles.selectedLabel}>{t("今天就吃")}</p>
            <h3>{selected.name}</h3>
            {selected.restaurant?.address && <p className={styles.address}>{selected.restaurant.address}</p>}
            <a className={styles.navigationLink} href={selected.restaurant
              ? restaurantDirectionsUrl(selected.restaurant)
              : `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: selected.name })}`} target="_blank" rel="noopener noreferrer">
              {selected.restaurant ? t("就吃这家，去导航 ↗") : t("在地图中搜索这家店 ↗")}
            </a>
            {!selected.restaurant && <p className={styles.navigationHint}>{t("按店名搜索，请在地图中确认具体分店。")}</p>}
            {sourceUrl && <a className={styles.detailLink} href={sourceUrl} target="_blank" rel="noopener noreferrer">{t("查看店铺详情 ↗")}</a>}
          </article>
          <p className={styles.drawStatus} role="status" aria-atomic="true">{remaining > 0
            ? t("已选中 {name}，还有 {count} 家未选过。", { name: selected.name, count: remaining })
            : t("已选中 {name}，本轮全部选过了，可以重新抽一轮。", { name: selected.name })}</p>
        </>
      )}
    </section>
  );
}
