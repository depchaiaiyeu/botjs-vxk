import fs from "fs";
import path from "path";
import axios from "axios";
import { sendMessageImageNotQuote, sendMessageCompleteRequest } from "../../chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";

const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const IMAGE_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "image");

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

function ensureImageDirectoryExists() {
  if (!fs.existsSync(IMAGE_RESOURCE_PATH)) {
    fs.mkdirSync(IMAGE_RESOURCE_PATH, { recursive: true });
  }
}

function readImageFiles() {
  ensureImageDirectoryExists();
  try {
    return fs.readdirSync(IMAGE_RESOURCE_PATH).filter(file =>
      [".jpg", ".jpeg", ".png", ".gif"].includes(path.extname(file).toLowerCase())
    );
  } catch (error) {
    console.error("Lỗi khi đọc danh sách ảnh:", error);
    return [];
  }
}

export async function sendImageDownload(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(" ");

  if (args[0].startsWith("http")) {
    const imageUrl = args[0];
    await sendMessageCompleteRequest(api, message, {
      caption: `📸 Ảnh từ link của bạn.`,
    }, 1800000);
    try {
      await api.sendImage(imageUrl, message, "", 5000000);
    } catch (error) {
      console.error("Lỗi khi gửi ảnh từ link:", error);
      await sendMessageCompleteRequest(api, message, {
        caption: "❌ Không thể tải và gửi ảnh từ link đã cung cấp.",
      }, 1800000);
    }
    return;
  }

  const keyword = args.join(" ").trim();
  const imageFiles = readImageFiles();

  if (!keyword) {
    const fileList = imageFiles.map((name, index) => `${index + 1}. ${name}`).join("\n");
    await sendMessageCompleteRequest(api, message, {
      caption: `📷 Danh sách ảnh đã lưu:\n${fileList}` +
        `\n\n📌 Dùng lệnh: ${prefix}${aliasCommand} <tên ảnh> để gửi ảnh hoặc dán link để gửi trực tiếp.`,
    }, 1800000);
    return;
  }
  const matchingFiles = imageFiles.filter(file => file.toLowerCase().includes(keyword.toLowerCase()));
  if (matchingFiles.length === 0) {
    const fileList = imageFiles.map((name, index) => `${index + 1}. ${name}`).join("\n");
    await sendMessageCompleteRequest(api, message, {
      caption: `❌ Không tìm thấy ảnh này trong danh sách!\n📷 Danh sách ảnh đã lưu:\n${fileList}` +
        `\n\n📌 Dùng lệnh: ${prefix}${aliasCommand} <tên ảnh> để gửi ảnh hoặc dán link để gửi trực tiếp.`,
    }, 1800000);
    return;
  }
  const imagePath = path.join(IMAGE_RESOURCE_PATH, matchingFiles[0]);
  try {
    await sendMessageCompleteRequest(api, message, {
      caption: `📸 Ảnh "${keyword}" của bạn đây!`,
    }, 1800000);
    await sendMessageImageNotQuote(api, { message: `` }, message.threadId, imagePath, 600000);
  } catch (error) {
    console.error("Lỗi khi gửi ảnh:", error);
  }
}
