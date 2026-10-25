"use client";

import { useLanguage } from "@/app/components/LanguageProvider";

import { useState, type FormEvent } from "react";
import useSavedText from "./useSavedText";
import styles from "./page.module.css";
import CloudCandidates from "./CloudCandidates";

type JoinedRoom = {
  roomCode: string;
  nickname: string;
  role: "host" | "member";
};

type JoinRoomFormProps = {
  nickname: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};

// 检查房间信息是否完整
function parseRoom(value: unknown): JoinedRoom | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (
    !("roomCode" in value) ||
    typeof value.roomCode !== "string" ||
    !/^[0-9]{6}$/.test(value.roomCode) ||
    !("nickname" in value) ||
    typeof value.nickname !== "string" ||
    !("role" in value) ||
    (value.role !== "host" && value.role !== "member")
  ) {
    return null;
  }

  return {
    roomCode: value.roomCode,
    nickname: value.nickname,
    role: value.role,
  };
}

// 读取之前保存在本机的显示信息
function restoreRoom(text: string): JoinedRoom | null {
  try {
    return parseRoom(JSON.parse(text));
  } catch {
    return null;
  }
}

export default function JoinRoomForm({
  nickname,
  disabled,
  onBusyChange,
}: JoinRoomFormProps) {
  const { t } = useLanguage();
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  const [savedRoom, setSavedRoom] = useSavedText(
    `what-to-eat:joined-room:${nickname}`
  );

  const joinedRoom = restoreRoom(savedRoom);

  async function handleJoin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (disabled || isJoining) {
      return;
    }

    setError("");

    const roomCode = roomCodeInput.trim();

    if (!/^[0-9]{6}$/.test(roomCode)) {
      setError("请输入六位数字房间号。");
      return;
    }

    if (!nickname.trim()) {
      setError("请先确认昵称。");
      return;
    }

    setIsJoining(true);
    onBusyChange(true);

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          roomCode,
          nickname: nickname.trim(),
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
            : "加入房间失败，请稍后重试。";

        throw new Error(message);
      }

      const room = parseRoom(data);

      if (!room || room.roomCode !== roomCode) {
        throw new Error("服务器没有返回正确的房间信息。");
      }

      setSavedRoom(JSON.stringify(room));
      setRoomCodeInput(room.roomCode);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "加入房间失败，请稍后重试。"
      );
    } finally {
      setIsJoining(false);
      onBusyChange(false);
    }
  }

  return (
    <section
      className={styles.choicePanel}
      aria-labelledby="join-room-title"
    >
      <h3
        id="join-room-title"
        className={styles.choiceTitle}
      >{t("加入朋友的房间")}</h3>

      <form className={styles.form} onSubmit={handleJoin}>
        <label
          className={styles.label}
          htmlFor="join-room-code"
        >{t("六位房间号")}</label>

        <input
          id="join-room-code"
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          required
          disabled={disabled || isJoining}
          value={roomCodeInput}
          placeholder={t("例如：307194")}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "join-room-error" : undefined
          }
          onChange={(event) => {
            setRoomCodeInput(event.target.value);
            setError("");
          }}
        />

        <button
          className={styles.submitButton}
          type="submit"
          disabled={disabled || isJoining}
          aria-busy={isJoining}
        >
          {isJoining ? t("正在加入…") : t("确认加入")}
        </button>

        {error ? (
          <p
            id="join-room-error"
            className={styles.errorText}
            role="alert"
          >
            {t(error)}
          </p>
        ) : null}
      </form>
      {joinedRoom ? (
        <section
          className={styles.roomPreview}
          aria-labelledby="joined-room-title"
        >
          <h3 id="joined-room-title">{t("当前已加入的房间")}</h3>

          <p className={styles.roomCode} role="status">
            {joinedRoom.roomCode}
          </p>

          <p className={styles.hint}>{t("你的昵称：{name}", { name: joinedRoom.nickname })}</p>

          <p className={styles.hint}>{t("你的角色：{role}", { role: joinedRoom.role === "host" ? t("房主") : t("成员") })}</p>

          <p className={styles.hint}>{t("下方候选清单和抽选结果由房间成员共享。")}</p>
        </section>
      ) : null}

      {joinedRoom ? (
        <CloudCandidates
          key={joinedRoom.roomCode}
          roomCode={joinedRoom.roomCode}
          disabled={disabled || isJoining}
        />
      ) : null}
    </section>
  );
}
