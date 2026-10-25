import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
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

        <section
          className={styles.options}
          aria-label="选择吃饭方式"
        >
          <Link href="/group" className={styles.option}>
            <strong>一起吃</strong>
            <span>大家提交想吃的，抽出一个共同选择。</span>
          </Link>

          <Link href="/nearby" className={styles.option}>
            <strong>附近吃</strong>
            <span>看看周围有什么，让它帮你选一家。</span>
          </Link>
        </section>

        <p className={styles.status}>
          先选一种方式试试看。
        </p>

        <footer className={styles.footer}>
          多人组队已开放 · 附近餐馆功能已开发
        </footer>
      </div>
    </main>
  );
}
