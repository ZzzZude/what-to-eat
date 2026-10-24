import "server-only";

import { createClient } from "@supabase/supabase-js";

export class DatabaseConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
    this.code = code;
  }
}

export function readDatabaseConfiguration(
  env: Record<string, string | undefined> = process.env
) {
  const url = env.SUPABASE_URL?.trim() ?? "";
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() ?? "";
  const placeholder = /替换|粘贴|你的|your[-_ ]?(?:project|key|secret)|\.{3}|…/i;

  if (!url) {
    throw new DatabaseConfigurationError(
      "MISSING_SUPABASE_URL",
      "请在项目根目录 .env.local 中填写 SUPABASE_URL 并保存。"
    );
  }

  if (placeholder.test(url)) {
    throw new DatabaseConfigurationError(
      "SUPABASE_URL_PLACEHOLDER",
      "项目地址仍是提示文字，请填写 Supabase 后台的 Project URL。"
    );
  }

  let projectUrl: URL;

  try {
    projectUrl = new URL(url);
  } catch {
    throw new DatabaseConfigurationError(
      "INVALID_SUPABASE_URL",
      "项目地址格式错误，请复制完整的 HTTPS Project URL。"
    );
  }

  if (
    projectUrl.protocol !== "https:" ||
    !projectUrl.hostname.endsWith(".supabase.co") ||
    projectUrl.pathname !== "/" ||
    projectUrl.search ||
    projectUrl.hash ||
    projectUrl.username ||
    projectUrl.password ||
    projectUrl.port
  ) {
    throw new DatabaseConfigurationError(
      "INVALID_SUPABASE_URL",
      "请使用 https://项目编号.supabase.co 格式的 Project URL。"
    );
  }

  if (!secretKey || placeholder.test(secretKey)) {
    throw new DatabaseConfigurationError(
      "MISSING_SUPABASE_SECRET_KEY",
      "请在项目根目录 .env.local 中填入完整 Secret key；不要保存到 app 文件夹内。"
    );
  }

  if (!/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(secretKey)) {
    throw new DatabaseConfigurationError(
      "INVALID_SUPABASE_SECRET_KEY",
      "请使用 sb_secret_ 开头的完整 Secret key，并通过复制按钮获取。"
    );
  }

  return { url: projectUrl.origin, secretKey };
}

export function createAdminClient() {
  const { url, secretKey } = readDatabaseConfiguration();

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
