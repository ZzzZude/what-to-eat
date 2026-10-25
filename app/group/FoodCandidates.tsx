"use client";

import { useLanguage } from "@/app/components/LanguageProvider";

import { useState, type FormEvent } from "react";
import useSavedText from "./useSavedText";
import styles from "./page.module.css";

type FoodCandidatesProps = {
  roomCode: string;
};

function parseFoods(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value;
    }

    return [];
  } catch {
    return [];
  }
}

export default function FoodCandidates({
  roomCode,
}: FoodCandidatesProps) {
  const { t } = useLanguage();
  const [foodName, setFoodName] = useState("");
  const [error, setError] = useState("");

  const [savedFoods, setSavedFoods] = useSavedText(
    `what-to-eat:room:${roomCode}:foods`,
    "[]"
  );

  const [pickedFood, setPickedFood] = useSavedText(
    `what-to-eat:room:${roomCode}:picked-food`
  );

  const foods = parseFoods(savedFoods);
  function handleAddFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedName = foodName.trim();

    if (!cleanedName) {
      setError("请填写食物或餐馆名称。");
      return;
    }

    if (foods.includes(cleanedName)) {
      setError("这个选项已经在清单里了。");
      return;
    }

    setSavedFoods(
      JSON.stringify([...foods, cleanedName])
    );

    setFoodName("");
    setError("");
    setPickedFood("");
  }

  function handleRemoveFood(name: string) {
    setSavedFoods(
      JSON.stringify(
        foods.filter((food) => food !== name)
      )
    );

    setError("");
    setPickedFood("");
  }
    function handlePickFood() {
    if (foods.length === 0) {

      return;
    }

    const randomIndex = Math.floor(
      Math.random() * foods.length
    );

    setPickedFood(foods[randomIndex]);
  }
    function handleClearFoods() {
    const confirmed = window.confirm(
      t("确定清空本房间的候选和抽选结果吗？")
    );

    if (!confirmed) {
      return;
    }

    setSavedFoods("[]");
    setPickedFood("");
    setFoodName("");
    setError("");
  }
  return (
    <section
      className={styles.choicePanel}
      aria-labelledby="food-list-title"
    >
      <h3 id="food-list-title" className={styles.choiceTitle}>{t("想吃什么？")}</h3>

      <form className={styles.form} onSubmit={handleAddFood}>
        <label className={styles.label} htmlFor="food-name">{t("食物或餐馆名称")}</label>

        <input
          id="food-name"
          className={styles.input}
          type="text"
          value={foodName}
          maxLength={60}
          placeholder={t("例如：寿司、拉面、一兰")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "food-error" : undefined}
          onChange={(event) => {
            setFoodName(event.target.value);
            setError("");
          }}
        />

        <button className={styles.submitButton} type="submit">{t("添加到清单")}</button>

        {error ? (
          <p
            id="food-error"
            className={styles.errorText}
            role="alert"
          >
            {t(error)}
          </p>
        ) : null}
      </form>

      <p className={styles.hint} role="status">{t("已添加 {count} 个选项", { count: foods.length })}</p>

      {foods.length === 0 ? (
        <p className={styles.hint}>{t("清单还是空的，先添加一个想吃的吧。")}</p>
      ) : (
        <ul className={styles.candidateList}>
          {foods.map((food) => (
            <li key={food} className={styles.candidateItem}>
              <span>{food}</span>

              <button
                type="button"
                className={styles.removeButton}
                aria-label={t("删除候选：{name}", { name: food })}
                onClick={() => handleRemoveFood(food)}
              >{t("删除")}</button>
            </li>
          ))}
        </ul>
      )}
            <div className={styles.drawPanel}>
        <button
          type="button"
          className={styles.submitButton}
          disabled={foods.length === 0}
          onClick={handlePickFood}
        >
          {pickedFood ? t("再选一次") : t("随机选一个")}
        </button>
        <button
          type="button"
          className={styles.removeButton}
          disabled={foods.length === 0 && !pickedFood}
          onClick={handleClearFoods}
        >{t("清空本房间清单")}</button>
        {pickedFood ? (
          <div className={styles.drawResult} role="status">
            <h4>{t("今天就吃")}</h4>
            <p className={styles.drawResultName}>
              {pickedFood}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
