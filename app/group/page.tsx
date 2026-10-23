"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import FoodCandidates from "./FoodCandidates";
import useSavedText from "./useSavedText";
import sharedStyles from "../page.module.css";
import styles from "./page.module.css";

export default function GroupPage() {
  const [nickname, setNickname] =
    useSavedText("what-to-eat:nickname");

  const [confirmedName, setConfirmedName] =
    useSavedText("what-to-eat:confirmed-name");

  const [selectedAction, setSelectedAction] =
    useSavedText("what-to-eat:selected-action");

  const [roomCode, setRoomCode] =
    useSavedText("what-to-eat:room-code");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedName = nickname.trim();

    if (!cleanedName) {
      return;
    }

    setConfirmedName(cleanedName);
    setSelectedAction("");
    setRoomCode("");
  }

  function handleCreateRoom() {
    if (!roomCode) {
      const newCode = Math.floor(
        100000 + Math.random() * 900000
      ).toString();

      setRoomCode(newCode);
    }

    setSelectedAction("create");
  }
  return (
    <main className={sharedStyles.page}>
      <div className={sharedStyles.content}>
        <Link href="/" className={styles.backLink}>
          ← 返回首页
        </Link>

        <header>
          <p className={sharedStyles.brand}>GROUP MODE</p>
          <h1 className={sharedStyles.title}>一起吃</h1>
          <p className={sharedStyles.subtitle}>
            输入昵称，然后创建一个新房间或加入朋友的房间。
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="nickname">
            你的昵称
          </label>

          <input
            id="nickname"
            className={styles.input}
            type="text"
            value={nickname}
            maxLength={20}
            required
            autoComplete="nickname"
            placeholder="例如：Yujie"
            onChange={(event) => {
              setNickname(event.target.value);
              setConfirmedName("");
              setSelectedAction("");
              setRoomCode("");
            }}
          />

          <button className={styles.submitButton} type="submit">
            确认昵称
          </button>
        </form>

        {confirmedName ? (
          <section
            className={styles.choicePanel}
            aria-labelledby="room-action-title"
          >
            <p className={styles.message}>
              你好，{confirmedName}！
            </p>

            <h2
              id="room-action-title"
              className={styles.choiceTitle}
            >
              接下来想做什么？
            </h2>

            <div className={styles.actionList}>
              <button
                type="button"
                className={styles.actionButton}
                aria-pressed={selectedAction === "create"}
                onClick={handleCreateRoom}
              >
                <strong>创建房间</strong>
                <span>我来发起，然后邀请朋友加入。</span>
              </button>

              <button
                type="button"
                className={styles.actionButton}
                aria-pressed={selectedAction === "join"}
                onClick={() => setSelectedAction("join")}
              >
                <strong>加入房间</strong>
                <span>输入朋友发来的房间号码。</span>
              </button>
            </div>

            {selectedAction === "create" && roomCode ? (
              <section
                className={styles.roomPreview}
                aria-labelledby="room-preview-title"
              >
                <h3 id="room-preview-title">房间信息预览</h3>

                <p className={styles.hint}>房间号</p>

                <p className={styles.roomCode} role="status">
                  {roomCode}
                </p>

                <p className={styles.hint}>
                  发起人：{confirmedName}
                </p>

                <p className={styles.hint}>
                  当前仅供本机预览，暂不支持朋友加入。
                </p>
              </section>
            ) : null}

            {selectedAction === "join" ? (
              <p className={styles.selection} role="status">
                已选择：加入房间。房间号输入功能将在后续步骤添加。
              </p>
            ) : null}
                        {roomCode ? (
              <div hidden={selectedAction !== "create"}>
<FoodCandidates
  key={roomCode}
  roomCode={roomCode}
/>
              </div>
            ) : null}
          </section>
        ) : (
          <p className={styles.hint}>
            昵称最长可以输入20个字符。
          </p>
        )}
      </div>
    </main>
  );
}