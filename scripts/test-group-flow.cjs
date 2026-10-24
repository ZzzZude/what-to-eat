// eslint-disable-next-line @typescript-eslint/no-require-imports -- 此 .cjs 测试脚本使用 CommonJS 加载 Node 内置模块。
const assert = require("node:assert/strict");
// 使用独立测试房间。Cookie 只存于内存，不打印。
async function call(method, path, body, cookie) {
  const response = await fetch(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function check(result, status, label) {
  assert.equal(result.status, status, `${label}：${JSON.stringify(result.data)}`);
}

(async () => {
  const host = await call("POST", "/api/rooms", { nickname: "抽选测试房主" });
  check(host, 201, "创建测试房间");
  assert.ok(host.cookie);
  const code = host.data.roomCode;
  const roomPath = `/api/rooms/${code}`;
  const listPath = `${roomPath}/candidates`;
  const drawPath = `${roomPath}/draw`;
  console.log("测试房间号：", code);

  const friend = await call("POST", "/api/rooms/join", {
    roomCode: code,
    nickname: "抽选测试朋友",
  });
  check(friend, 200, "朋友加入");
  assert.ok(friend.cookie);

  check(await call("POST", drawPath), 401, "无凭证抽选");
  check(await call("POST", drawPath, undefined, friend.cookie), 403, "成员发起抽选");
  check(await call("POST", drawPath, undefined, host.cookie), 409, "空清单抽选");
  console.log("通过：无凭证、非房主和空清单请求均被拒绝");

  const sushi = await call("POST", listPath, { name: "寿司" }, host.cookie);
  check(sushi, 201, "添加寿司");
  check(await call("POST", listPath, { name: "拉面" }, friend.cookie), 201, "添加拉面");

  async function drawAndCheck() {
    // 故意提交外部名称，验证接口不会接受客户端指定的答案。
    const generated = await call(
      "POST", drawPath, { selectedName: "不在候选里的披萨" }, host.cookie
    );
    check(generated, 201, "房主抽选");
    const [hostView, friendView] = await Promise.all([
      call("GET", roomPath, undefined, host.cookie),
      call("GET", roomPath, undefined, friend.cookie),
    ]);
    check(hostView, 200, "房主读取结果");
    check(friendView, 200, "朋友读取结果");
    const selected = generated.data.draw.selectedName;
    assert.ok(hostView.data.candidates.some((item) => item.name === selected));
    assert.equal(hostView.data.room.currentResult, selected);
    assert.equal(friendView.data.room.currentResult, selected);
    console.log("通过：结果来自云端候选，双方答案一致：", selected);
  }

  await drawAndCheck();

  check(await call("POST", listPath, { name: "咖喱" }, friend.cookie), 201, "新增候选");
  const afterAdd = await call("GET", roomPath, undefined, host.cookie);
  check(afterAdd, 200, "新增后读取");
  assert.equal(afterAdd.data.room.currentResult, null);
  console.log("通过：新增候选后旧结果失效");

  await drawAndCheck();
  check(await call(
    "DELETE", `${listPath}/${sushi.data.candidate.id}`, undefined, host.cookie
  ), 200, "删除候选");
  const afterDelete = await call("GET", roomPath, undefined, friend.cookie);
  check(afterDelete, 200, "删除后读取");
  assert.equal(afterDelete.data.room.currentResult, null);
  console.log("通过：删除候选后旧结果失效");

  await drawAndCheck();
  check(await call("POST", `${roomPath}/clear`, undefined, host.cookie), 200, "清空候选");
  const afterClear = await call("GET", roomPath, undefined, friend.cookie);
  check(afterClear, 200, "清空后读取");
  assert.equal(afterClear.data.room.currentResult, null);
  assert.equal(afterClear.data.candidates.length, 0);
  assert.equal(afterClear.data.members.length, 2);
  check(await call("POST", drawPath, undefined, host.cookie), 409, "清空后抽选");
  console.log("通过：清空后结果和候选为空，成员保留");
  console.log("全部测试通过。本测试房间应保留 3 条抽选历史。");
})().catch((error) => {
  console.error("测试未通过：", error.message);
  process.exitCode = 1;
});
