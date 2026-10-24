"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import CloudCandidates from "./CloudCandidates";
import JoinRoomForm from "./JoinRoomForm";
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
  useSavedText("what-to-eat:cloud-room-code");

const [isCreating, setIsCreating] = useState(false);
const [createError, setCreateError] = useState("");
const [isJoining, setIsJoining] = useState(false);
const isBusy = isCreating || isJoining;
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");

    const cleanedName = nickname.trim();

    if (!cleanedName) {
      return;
    }

    setConfirmedName(cleanedName);
    setSelectedAction("");
    setRoomCode("");
  }

async function handleCreateRoom() {
  if (isBusy) {
    return;
  }

  setCreateError("");

  const cleanedName = confirmedName.trim();

  if (!cleanedName) {
    setCreateError("请先确认昵称。");
    return;
  }

  // 已有房间时，重新显示它，不重复创建
  if (roomCode) {
    setSelectedAction("create");
    return;
  }

  setIsCreating(true);

  try {
    // 把昵称提交给我们自己的后端接口
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        nickname: cleanedName,
      }),
    });

    const data: unknown = await response.json();

    if (typeof data !== "object" || data === null) {
      throw new Error("服务器返回的数据格式不正确。");
    }

    if (
      !response.ok ||
      !("ok" in data) ||
      data.ok !== true
    ) {
      const message =
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : "创建房间失败，请稍后重试。";

      throw new Error(message);
    }

    if (
      !("roomCode" in data) ||
      typeof data.roomCode !== "string" ||
      !/^[0-9]{6}$/.test(data.roomCode)
    ) {
      throw new Error("服务器没有返回有效的六位房间号。");
    }

    // 只有后端创建成功，才保存并展示房间号
    setRoomCode(data.roomCode);
    setSelectedAction("create");
  } catch (error) {
    setCreateError(
      error instanceof Error
        ? error.message
        : "创建房间失败，请稍后重试。"
    );
  } finally {
    setIsCreating(false);
  }
}  return (
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
            disabled={isBusy}
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
              setCreateError("");
            }}
          />

<button
  className={styles.submitButton}
  type="submit"
  disabled={isBusy}
>
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
  aria-busy={isCreating}
  disabled={isBusy}
  onClick={handleCreateRoom}
>
  <strong>
    {isCreating ? "正在创建…" : "创建房间"}
  </strong>
  <span>我来发起，然后邀请朋友加入。</span>
              </button>

              <button
                type="button"
                className={styles.actionButton}
                disabled={isBusy}
                aria-pressed={selectedAction === "join"}
                onClick={() => setSelectedAction("join")}
              >
                <strong>加入房间</strong>
                <span>输入朋友发来的房间号码。</span>
              </button>            </div>
{createError ? (
  <p className={styles.errorText} role="alert">
    {createError}
  </p>
) : null}
            {selectedAction === "create" && roomCode ? (
              <section
                className={styles.roomPreview}
                aria-labelledby="room-preview-title"
              >
                <h3 id="room-preview-title">房间已创建</h3>

                <p className={styles.hint}>房间号</p>

                <p className={styles.roomCode} role="status">
                  {roomCode}
                </p>

                <p className={styles.hint}>
                  发起人：{confirmedName}
                </p>

                <p className={styles.hint}>
                  候选清单和抽选结果已支持云端共享。
                </p>
              </section>
            ) : null}

            {selectedAction === "join" ? (
  <JoinRoomForm
    key={confirmedName}
    nickname={confirmedName}
    disabled={isBusy}
    onBusyChange={setIsJoining}
  />
) : null}
{selectedAction === "create" && roomCode ? (
  <CloudCandidates
    key={roomCode}
    roomCode={roomCode}
    disabled={isBusy}
  />
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