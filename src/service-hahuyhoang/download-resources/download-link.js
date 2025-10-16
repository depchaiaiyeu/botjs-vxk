import path from 'path';
import fs from 'fs';
import { getGlobalPrefix } from '../service.js';
import { removeMention } from '../../utils/format-util.js';
import { sendMessageWarningRequest, sendMessageCompleteRequest } from '../chat-zalo/chat-style/chat-style.js';

const RESOURCE_BASE_PATH = path.join(process.cwd(), 'assets', 'resources', 'voice');
const VOICE_JSON_PATH = path.join(RESOURCE_BASE_PATH, 'voice_links.json');

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

// Đảm bảo thư mục và file JSON tồn tại
function ensureVoiceJsonExists() {
  if (!fs.existsSync(RESOURCE_BASE_PATH)) {
    fs.mkdirSync(RESOURCE_BASE_PATH, { recursive: true });
  }
  if (!fs.existsSync(VOICE_JSON_PATH)) {
    fs.writeFileSync(VOICE_JSON_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
}

// Đọc dữ liệu từ file JSON
function readVoiceJson() {
  ensureVoiceJsonExists();
  return JSON.parse(fs.readFileSync(VOICE_JSON_PATH, 'utf8'));
}

// Ghi dữ liệu vào file JSON
function writeVoiceJson(data) {
  fs.writeFileSync(VOICE_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Xử lý lệnh lưu link voice
 */
export async function handleSaveVoiceLink(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  if (args.length < 2) {
    const object = {
      caption: `Vui lòng nhập đúng cú pháp: ${prefix}${aliasCommand} [thư mục lưu]|[tên voice] và reply tin nhắn chứa link voice!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const [folderName, fileName] = args;
  let fileUrl = null;
  const quote = message.data?.quote;

  if (quote) {
    try {
      const parseMessage = JSON.parse(quote.attach);
      fileUrl = parseMessage?.href;
    } catch (error) {
      console.error("Lỗi khi parse quote:", error);
    }
  }

  if (!fileUrl) {
    const object = {
      caption: `Vui lòng reply tin nhắn chứa file voice cần lưu!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    const folderPath = path.join(RESOURCE_BASE_PATH, folderName);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const voiceData = readVoiceJson();
    if (!voiceData[folderName]) {
      voiceData[folderName] = {};
    }
    voiceData[folderName][fileName] = fileUrl;
    writeVoiceJson(voiceData);

    const object = {
      caption: `✅ Đã lưu link thành công!
📂 Thư mục: ${folderName}
📄 Tên voice: ${fileName}
🔗 Link: ${fileUrl}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } catch (error) {
    console.error("Lỗi khi lưu link:", error);
    const object = {
      caption: `❌ Đã xảy ra lỗi khi lưu link. Vui lòng thử lại sau!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
