"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [selectedMode, setSelectedMode] = useState("");

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header>
          <p className={styles.brand}>なに食べる？</p>
          <h1 className={styles.title}>今天吃啥？</h1>
          <p className={styles.subtitle}>
            一个人随便选，一群人一起选。
          </p>
        </header>

        <section className={styles.options} aria-label="选择吃饭方式">
<Link href="/group" className={styles.option}>
  <strong>一起吃</strong>
  <span>大家提交想吃的，抽出一个共同选择。</span>
</Link>

          <button
            type="button"
            className={styles.option}
            aria-pressed={selectedMode === "nearby"}
            onClick={() => setSelectedMode("nearby")}
          >
            <strong>附近吃</strong>
            <span>看看周围有什么，让它帮你选一家。</span>
          </button>
        </section>

        <p className={styles.status} role="status">
          {selectedMode === "nearby"
            ? "附近餐馆功能暂未开放。"
            : "先选一种方式试试看。"}
        </p>

        <footer className={styles.footer}>
          多人组队已开放 · 附近餐馆功能开发中
        </footer>
      </div>
    </main>
  );
}