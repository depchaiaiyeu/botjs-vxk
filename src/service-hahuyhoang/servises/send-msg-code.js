import fs from "fs";
import path from "path";
import { MessageType } from "zlbotdqt";
import { initializeGroupEvent, GroupEventType } from "../../api-zalo/models/GroupEvent.js";
import { sendMessageWarning, sendMessageStateQuote, sendMessageCompleteRequest } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { uploadFileOnly } from "../../utils/util.js";

const keywordFilePath = path.join(process.cwd(), "assets/json-data/data-keywords-pr.json");
const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const IMAGE_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "file");
const UPLOADED_CACHE_PATH = path.join(process.cwd(), "assets/json-data/uploaded-files.json");

function loadKeywordData() {
  try {
    if (!fs.existsSync(keywordFilePath)) return {};
    return JSON.parse(fs.readFileSync(keywordFilePath, "utf-8"));
  } catch {
    return {};
  }
}

function saveKeywordData(data) {
  try {
    fs.writeFileSync(keywordFilePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function loadUploadedFiles() {
  try {
    if (!fs.existsSync(UPLOADED_CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(UPLOADED_CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveUploadedFiles(data) {
  try {
    fs.writeFileSync(UPLOADED_CACHE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export async function uploadAndSendFileIfNeeded(api, uid, fileName, uploadedCache) {
  const filePath = path.join(IMAGE_RESOURCE_PATH, fileName);
  const ext = path.extname(fileName).slice(1);
  if (!fs.existsSync(filePath)) return;

  const cached = uploadedCache[fileName];
  if (cached?.fileUrl) {
    try {
      await api.sendFile(
        {
          uidFrom: uid,
          threadId: uid,
          type: MessageType.DirectMessage
        },
        cached.fileUrl,
        0,
        cached.fileName,
        cached.totalSize,
        ext,
        cached.checksum
      );
      return;
    } catch {}
  }

  try {
    const file = await uploadFileOnly(api, filePath, uid, MessageType.DirectMessage);
    if (file?.fileUrl) {
      await api.sendFile(
        {
          uidFrom: uid,
          threadId: uid,
          type: MessageType.DirectMessage
        },
        file.fileUrl,
        0,
        file.fileName,
        file.totalSize,
        ext,
        file.checksum
      );
      uploadedCache[fileName] = {
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        totalSize: file.totalSize,
        checksum: file.checksum
      };
      saveUploadedFiles(uploadedCache);
    }
  } catch {}
}

export async function handleWelcomeByGroup(api, event) {
  const groupEvent = initializeGroupEvent(event.data, event.type);
  if (groupEvent.type !== GroupEventType.JOIN) return;

  const threadId = groupEvent.threadId;
  const groupName = event.data?.groupName || "nhóm chúng tôi";
  const data = loadKeywordData();
  const groupWelcome = data.groupprqcSettings?.[threadId];
  const uploadedCache = loadUploadedFiles();

  if (!groupWelcome?.enabled) return;

  const members = event.data?.updateMembers || [];

  for (const member of members) {
    const uid = member.id;
    const name = member.dName || "bạn";

    for (const raw of groupWelcome.text || []) {
      const msg = raw.replace(/{name}/g, name).replace(/{group}/g, groupName);
      try {
        await api.sendMessage({ msg, ttl: 60000000 }, uid, MessageType.DirectMessage);
      } catch {}
    }

    for (const fileName of groupWelcome.file || []) {
      const isUrl = fileName.startsWith("http");
      if (isUrl) continue;
      const ext = path.extname(fileName).slice(1).toLowerCase();
      const filePath = path.join(IMAGE_RESOURCE_PATH, fileName);
      if (!fs.existsSync(filePath)) continue;
      try {
        await uploadAndSendFileIfNeeded(api, uid, fileName, uploadedCache);
      } catch {}
    }

    for (const card of groupWelcome.card || []) {
      const userId = typeof card === "string" ? card : card.id;
      const text = typeof card === "string" ? "Thông tin liên hệ" : (card.text || "Thông tin liên hệ");
      if (!userId) continue;
      try {
        await api.sendBusinessCard(
          null,
          userId,
          text,
          MessageType.DirectMessage,
          uid
        );
      } catch {}
    }
  }
}

export async function handleWelcomeCommand(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const command = args[0]?.toLowerCase();
  const type = args[1]?.toLowerCase();
  const value = args.slice(2).join(" ").trim();

  const data = loadKeywordData();
  if (!data.groupprqcSettings) data.groupprqcSettings = {};
  if (!data.groupprqcSettings[threadId]) {
    data.groupprqcSettings[threadId] = { enabled: false, text: [], file: [], card: [] };
  }
  const setting = data.groupprqcSettings[threadId];
  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  if (["on", "off"].includes(command)) {
    setting.enabled = command === "on";
    saveKeywordData(data);
    await sendMessageStateQuote(api, message, `Chức năng gửi chào riêng đã được ${setting.enabled ? "bật" : "tắt"}!`, setting.enabled, 30000);
    return true;
  }

  if (command === "add" && ["text", "file", "card"].includes(type)) {
    const items = value.split("|").map(i => i.trim()).filter(Boolean);
    if (!items.length) {
      await sendMessageWarning(api, message, "Không có nội dung hợp lệ để thêm.");
      return;
    }
    setting[type].push(...items);
    saveKeywordData(data);
    const preview = items.map(i => `• ${i}`).join("\n");
    await sendMessageStateQuote(api, message, `Đã thêm ${items.length} mục vào ${type}:\n${preview}`, true, 15000);
    return;
  }

  if (command === "list" && ["text", "file", "card"].includes(type)) {
    const list = setting[type];
    if (!list.length) {
      return sendMessageStateQuote(api, message, `Chưa có mục nào trong ${type}.`, false, 10000);
    }
    const preview = list.map((val, i) => `${i + 1}. ${val}`).join("\n");
    return sendMessageStateQuote(api, message, `📋 Danh sách ${type}:\n${preview}`, true, 30000);
  }

  if (command === "del" && ["text", "file", "card"].includes(type)) {
    const index = parseInt(value);
    if (isNaN(index) || index < 1 || index > setting[type].length) {
      await sendMessageWarning(api, message, "Số thứ tự không hợp lệ.");
      return;
    }
    const removed = setting[type].splice(index - 1, 1);
    saveKeywordData(data);
    await sendMessageStateQuote(api, message, `Đã xoá ${type}: "${removed[0]}"`, true, 10000);
    return;
  }

  await sendMessageWarning(api, message,
    `❌ Sai cú pháp.\n` +
    `- ${prefix}${aliasCommand} on/off\n` +
    `- ${prefix}${aliasCommand} add text|file|card nội_dung1 | nội_dung2\n` +
    `- ${prefix}${aliasCommand} list text|file|card\n` +
    `- ${prefix}${aliasCommand} del text|file|card <số>`
  );
}
