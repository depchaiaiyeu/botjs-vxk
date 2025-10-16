import fs from "fs/promises";
import path from "path";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";

const whitelistFilePath = path.join(process.cwd(), "assets/json-data/whitelist_links.json");

async function ensureWhitelistFile() {
  try {
    await fs.access(whitelistFilePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      const initialData = { groups: {} };
      await fs.writeFile(whitelistFilePath, JSON.stringify(initialData, null, 2), "utf8");
    } else {
      console.error("Lỗi khi kiểm tra file whitelist:", error);
    }
  }
}

export async function readWhitelist(threadId) {
  await ensureWhitelistFile();
  try {
    const data = JSON.parse(await fs.readFile(whitelistFilePath, "utf8"));
    return data.groups?.[threadId] ?? [];
  } catch (error) {
    console.error("Lỗi khi đọc whitelist:", error);
    return [];
  }
}

export async function writeWhitelist(threadId, list) {
  await ensureWhitelistFile();
  try {
    const data = JSON.parse(await fs.readFile(whitelistFilePath, "utf8"));
    if (!data.groups) data.groups = {};
    data.groups[threadId] = list;
    await fs.writeFile(whitelistFilePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi ghi file whitelist:", error);
  }
}

export async function areAllLinksWhitelisted(links, threadId) {
  const whitelist = await readWhitelist(threadId);

  return links.every(link => {
    try {
      const url = new URL(link);
      const pathSegments = url.pathname.split("/").filter(Boolean);
      const host = url.hostname;

      return whitelist.some(keyword =>
        host.includes(keyword) || pathSegments.includes(keyword)
      );
    } catch {
      return false;
    }
  });
}

export async function handleWhitelistCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const threadId = message.threadId;

  if (args.length < 1) {
    return sendInvalidUsage(api, message, prefix, aliasCommand);
  }

  const command = args[0].toLowerCase();
  const link = args[1];
  const whitelist = await readWhitelist(threadId);

  switch (command) {
    case "add":
      if (!link) return sendMessageStateQuote(api, message, "Vui lòng cung cấp link để thêm.", false, 300000);
      if (whitelist.includes(link)) {
        return sendMessageStateQuote(api, message, `Link ${link} đã tồn tại trong whitelist nhóm.`, false, 300000);
      }
      whitelist.push(link);
      await writeWhitelist(threadId, whitelist);
      return sendMessageStateQuote(api, message, `Đã thêm ${link} vào whitelist nhóm.`, true, 300000);

    case "remove":
      if (!link) return sendMessageStateQuote(api, message, "Vui lòng cung cấp link để xóa.", false, 300000);
      if (!whitelist.includes(link)) {
        return sendMessageStateQuote(api, message, `Link ${link} không tồn tại trong whitelist nhóm.`, false, 300000);
      }
      const updated = whitelist.filter(item => item !== link);
      await writeWhitelist(threadId, updated);
      return sendMessageStateQuote(api, message, `Đã xóa ${link} khỏi whitelist nhóm.`, true, 300000);

    case "list":
      if (whitelist.length === 0) {
        return sendMessageStateQuote(api, message, "Whitelist nhóm hiện đang trống.", false, 300000);
      }
      const listText = whitelist.map((item, i) => `${i + 1}. ${item}`).join("\n");
      return sendMessageStateQuote(api, message, `Danh sách whitelist của nhóm:\n${listText}`, true, 300000);

    default:
      return sendInvalidUsage(api, message, prefix, aliasCommand);
  }
}

function sendInvalidUsage(api, message, prefix, aliasCommand) {
  return sendMessageStateQuote(
    api,
    message,
    `Lệnh không hợp lệ. Sử dụng: ${prefix}${aliasCommand} add <link> | remove <link> | list`,
    false,
    300000
  );
}
