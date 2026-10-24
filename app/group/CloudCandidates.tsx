"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import styles from "./page.module.css";

type Member = {
  id: string;
  nickname: string;
  role: "host" | "member";
};

type Candidate = {
  id: string;
  name: string;
  submittedBy: string;
};

type RoomData = {
  room: {
    code: string;
    status: "open" | "closed";
    currentResult: string | null;
  };
  currentMember: Member;
  members: Member[];
  candidates: Candidate[];
};

// 检查接口返回的数据
function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isMember(value: unknown): value is Member {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.nickname === "string" &&
    (value.role === "host" || value.role === "member")
  );
}

function isCandidate(value: unknown): value is Candidate {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.submittedBy === "string"
  );
}

function isRoomData(
  value: unknown,
  code: string
): value is RoomData {
  return (
    isObject(value) &&
    isObject(value.room) &&
    value.room.code === code &&
    (value.room.status === "open" ||
      value.room.status === "closed") &&
    (value.room.currentResult === null ||
      typeof value.room.currentResult === "string") &&
    isMember(value.currentMember) &&
    Array.isArray(value.members) &&
    value.members.every(isMember) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidate)
  );
}

async function readResponse(response: Response) {
  const data: unknown = await response.json();

  if (!isObject(data)) {
    throw new Error("服务器返回的数据格式不正确。");
  }

  if (!response.ok || data.ok !== true) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "请求失败，请稍后重试。"
    );
  }

  return data;
}

type Props = {
  roomCode: string;
  disabled?: boolean;
};

export default function CloudCandidates({
  roomCode,
  disabled = false,
}: Props) {
  const id = useId();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [foodName, setFoodName] = useState("");
  const [readError, setReadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [clearing, setClearing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 进入房间后读取清单，再定时检查更新
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function refresh() {
      let retry = true;

      try {
        const response = await fetch(
          `/api/rooms/${roomCode}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }
        );

        // 身份失效或房间不存在时，停止自动重试
        if ([401, 403, 404].includes(response.status)) {
          retry = false;
        }

        const data = await readResponse(response);

        if (!isRoomData(data, roomCode)) {
          throw new Error("房间数据不完整，请重新刷新。");
        }

        if (!active) return;

        setRoom(data);
        setReadError("");
      } catch (error) {
        if (!active) return;

        setReadError(
          error instanceof TypeError
            ? "网络连接异常，请检查网络后刷新清单。"
            : error instanceof Error
              ? error.message
              : "读取房间失败。"
        );
      } finally {
        if (active) {
          setLoading(false);

          if (retry) {
            timer = setTimeout(refresh, 3000);
          }
        }
      }
    }

    void refresh();

    // 离开面板时停止请求和定时器
    return () => {
      active = false;
      controller.abort();

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [roomCode, refreshKey]);

  const busy = saving || Boolean(deletingId) || clearing || drawing;

  const canEdit = Boolean(
    room &&
      room.room.status === "open" &&
      !readError &&
      !busy &&
      !disabled
  );

  // 提交候选到云端
  async function handleAdd(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canEdit) return;

    setSubmitError("");
    setNotice("");

    const name = foodName.trim();

    if (
      Array.from(name).length < 1 ||
      Array.from(name).length > 60
    ) {
      setSubmitError("候选名称需要填写 1～60 个字符。");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/rooms/${roomCode}/candidates`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ name }),
        }
      );

      await readResponse(response);

      setFoodName("");
      setNotice("已保存到云端。");
    } catch (error) {
      setSubmitError(
        error instanceof TypeError
          ? "网络连接异常，请先刷新清单确认是否已添加，再决定重试。"
          : error instanceof Error
            ? error.message
            : "添加失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
      setRefreshKey((value) => value + 1);
    }
  }

  // 确认并删除云端候选
  async function handleDelete(candidate: Candidate) {
    if (!canEdit || !room) return;

    const allowed =
      room.currentMember.role === "host" ||
      room.currentMember.id === candidate.submittedBy;

    if (!allowed) {
      setSubmitError("成员只能删除自己提交的候选。");
      return;
    }

    const confirmed = window.confirm(
      `确定从共享清单删除“${candidate.name}”吗？`
    );

    if (!confirmed) return;

    setDeletingId(candidate.id);
    setSubmitError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/rooms/${roomCode}/candidates/${candidate.id}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        }
      );

      const data = await readResponse(response);

      if (data.deletedId !== candidate.id) {
        throw new Error(
          "服务器没有返回正确的删除结果，请刷新清单确认。"
        );
      }

      setNotice(`已从云端删除“${candidate.name}”。`);
    } catch (error) {
      setSubmitError(
        error instanceof TypeError
          ? "网络连接异常，请先刷新清单确认删除结果。"
          : error instanceof Error
            ? error.message
            : "删除失败，请稍后重试。"
      );
    } finally {
      setDeletingId("");
      setRefreshKey((value) => value + 1);
    }
  }

  // 房主确认后清空共享候选
  async function handleClear() {
    if (!canEdit || !room) return;

    if (room.currentMember.role !== "host") {
      setSubmitError("只有房主可以清空共享清单。");
      return;
    }

    const confirmed = window.confirm(
      "确定清空这个房间的全部候选吗？当前抽选结果也会清除，房间和成员会保留。"
    );

    if (!confirmed) return;

    setClearing(true);
    setSubmitError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/rooms/${roomCode}/clear`,
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data = await readResponse(response);

      if (
        typeof data.deletedCount !== "number" ||
        !Number.isInteger(data.deletedCount) ||
        data.deletedCount < 0
      ) {
        throw new Error("服务器没有返回正确的清空结果，请刷新清单确认。");
      }

      setFoodName("");
      setNotice(`已清空 ${data.deletedCount} 个候选，可以重新添加。`);
    } catch (error) {
      setSubmitError(
        error instanceof TypeError
          ? "网络连接异常，请先刷新清单确认清空结果。"
          : error instanceof Error
            ? error.message
            : "清空失败，请稍后重试。"
      );
    } finally {
      setClearing(false);
      setRefreshKey((value) => value + 1);
    }
  }

  // 房主请求统一抽选，显示结果仍以云端读取的数据为准
  async function handleDraw() {
    if (!canEdit || !room) return;

    if (room.currentMember.role !== "host") {
      setSubmitError("只有房主可以发起统一抽选。");
      return;
    }

    if (room.candidates.length === 0) {
      setSubmitError("请先添加至少一个候选。");
      return;
    }

    setDrawing(true);
    setSubmitError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/rooms/${roomCode}/draw`,
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data = await readResponse(response);

      if (
        !isObject(data.draw) ||
        typeof data.draw.id !== "string" ||
        typeof data.draw.selectedName !== "string" ||
        data.draw.selectedName.length === 0
      ) {
        throw new Error("服务器没有返回有效的抽选结果，请刷新确认。");
      }

      setNotice("抽选已完成。");
    } catch (error) {
      setSubmitError(
        error instanceof TypeError
          ? "网络连接异常，请先刷新确认结果，再决定是否重新抽选。"
          : error instanceof Error
            ? error.message
            : "抽选失败，请稍后重试。"
      );
    } finally {
      setDrawing(false);
      setRefreshKey((value) => value + 1);
    }
  }

  return (
    <section
      className={styles.choicePanel}
      aria-labelledby={`${id}-title`}
    >
      <h3
        id={`${id}-title`}
        className={styles.choiceTitle}
      >
        一起添加想吃的
      </h3>

      <p className={styles.hint}>
        房间 {roomCode} · 约每 3 秒检查更新
      </p>

      <button
        type="button"
        className={styles.removeButton}
        disabled={busy}
        onClick={() => setRefreshKey((value) => value + 1)}
      >
        刷新清单
      </button>

      {room?.currentMember.role === "host" ? (
        <button
          type="button"
          className={styles.removeButton}
          style={{ marginLeft: 12 }}
          disabled={
            !canEdit ||
            (room.candidates.length === 0 &&
              room.room.currentResult === null)
          }
          aria-busy={clearing}
          onClick={() => void handleClear()}
        >
          {clearing ? "正在清空…" : "清空共享清单"}
        </button>
      ) : null}

      {loading ? (
        <p className={styles.hint} role="status">
          正在读取云端清单…
        </p>
      ) : null}

      {readError ? (
        <p className={styles.errorText} role="alert">
          {readError} 当前清单和抽选结果可能不是最新。
        </p>
      ) : null}

      {room ? (
        <p className={styles.hint}>
          房间成员：
          {room.members
            .map((member) => member.nickname)
            .join("、")}
          <br />
          当前身份：{room.currentMember.nickname}
          （
          {room.currentMember.role === "host"
            ? "房主"
            : "成员"}
          ）
        </p>
      ) : null}

      {room?.room.status === "closed" ? (
        <p className={styles.errorText}>
          房间已关闭，不能修改清单或抽选。
        </p>
      ) : null}

      <form className={styles.form} onSubmit={handleAdd}>
        <label
          className={styles.label}
          htmlFor={`${id}-food`}
        >
          食物或餐馆名称
        </label>

        <input
          id={`${id}-food`}
          className={styles.input}
          type="text"
          value={foodName}
          maxLength={60}
          required
          disabled={!canEdit}
          placeholder="例如：寿司、拉面、一兰"
          aria-invalid={Boolean(submitError)}
          aria-describedby={
            submitError ? `${id}-error` : undefined
          }
          onChange={(event) => {
            setFoodName(event.target.value);
            setSubmitError("");
            setNotice("");
          }}
        />

        <button
          className={styles.submitButton}
          type="submit"
          disabled={!canEdit}
        >
          {saving ? "正在保存…" : "添加到共享清单"}
        </button>

        {submitError ? (
          <p
            id={`${id}-error`}
            className={styles.errorText}
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        {notice ? (
          <p className={styles.message} role="status">
            {notice}
          </p>
        ) : null}
      </form>

      {room ? (
        <>
          <p className={styles.hint}>
            云端共有 {room.candidates.length} 个选项
          </p>

          {room.candidates.length === 0 ? (
            <p className={styles.hint}>
              清单还是空的，先添加一个吧。
            </p>
          ) : (
            <ul className={styles.candidateList}>
              {room.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className={styles.candidateItem}
                >
                  <div style={{ minWidth: 0 }}>
                    <span>{candidate.name}</span>
                    <br />
                    <small>
                      {room.members.find(
                        (member) =>
                          member.id === candidate.submittedBy
                      )?.nickname ?? "成员"}{" "}
                      提交
                    </small>
                  </div>

                  {room.currentMember.role === "host" ||
                  room.currentMember.id === candidate.submittedBy ? (
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={!canEdit}
                      aria-label={`删除候选：${candidate.name}`}
                      aria-busy={deletingId === candidate.id}
                      onClick={() => void handleDelete(candidate)}
                    >
                      {deletingId === candidate.id
                        ? "正在删除…"
                        : "删除"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {room ? (
        <section
          className={styles.drawPanel}
          aria-labelledby={`${id}-draw-title`}
        >
          <h3
            id={`${id}-draw-title`}
            className={styles.choiceTitle}
          >
            一起决定吃什么
          </h3>

          {room.currentMember.role === "host" ? (
            <>
              <button
                type="button"
                className={styles.submitButton}
                disabled={!canEdit || room.candidates.length === 0}
                aria-busy={drawing}
                onClick={() => void handleDraw()}
              >
                {drawing
                  ? "正在抽选…"
                  : room.room.currentResult !== null
                    ? "再选一次"
                    : "随机选一个"}
              </button>
              <p className={styles.hint}>
                每次重新随机抽选，可能出现相同结果。
              </p>
            </>
          ) : (
            <p className={styles.hint}>
              由房主发起抽选，结果会自动同步到这里。
            </p>
          )}

          {room.room.currentResult !== null ? (
            <div className={styles.drawResult} role="status">
              <h4>今天就吃</h4>
              <p className={styles.drawResultName}>
                {room.room.currentResult}
              </p>
            </div>
          ) : (
            <p className={styles.hint} role="status">
              还没有有效的抽选结果，请先添加候选并由房主发起抽选。
            </p>
          )}
        </section>
      ) : null}

      <p className={styles.hint}>
        房主可抽选、删除任意候选或清空清单；成员可添加候选并删除自己的提交。
      </p>
    </section>
  );
}