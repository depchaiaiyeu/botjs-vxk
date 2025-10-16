import fs from "fs";
import path from "path";
import axios from "axios";
import { sendMessageCompleteRequest, sendMessageFailed } from "../../chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";
import { sendVoiceMusic } from "./send-voice.js";
import { uploadAudioFile } from "./process-audio.js";
import { handleGetVoiceCommand } from "./send-voice.js";
import { checkExstentionFileRemote } from "../../../../utils/util.js";

const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources", "voice");
const TEMP_AUDIO_PATH = path.join(process.cwd(), "assets", "temp");

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

const ALLOWED_AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "flac", "aac"];
function ensureDirectories() {
  if (!fs.existsSync(RESOURCE_BASE_PATH)) fs.mkdirSync(RESOURCE_BASE_PATH, { recursive: true });
  if (!fs.existsSync(TEMP_AUDIO_PATH)) fs.mkdirSync(TEMP_AUDIO_PATH, { recursive: true });
}
function getVoiceFiles() {
  const files = fs.readdirSync(RESOURCE_BASE_PATH);
  return files
    .filter(file => ALLOWED_AUDIO_EXT.includes(path.extname(file).slice(1).toLowerCase()))
    .map(file => ({
      name: path.basename(file, path.extname(file)),
      fullPath: path.join(RESOURCE_BASE_PATH, file),
    }));
}
async function downloadFile(url, savePath) {
  try {
    const response = await axios({ url, method: "GET", responseType: "stream" });
    const writer = fs.createWriteStream(savePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(savePath));
      writer.on("error", reject);
    });
  } catch {
    throw new Error("❌ Không thể tải file từ link đã cung cấp.");
  }
}
function addFileExtensionIfNeeded(url, defaultExt = "/NguyenPhiHoang.aac") {
  if (!path.extname(url)) {
    return url + defaultExt; 
  }
  return url;
}

export async function handleSendVoice(api, message, aliasCommand) {
  ensureDirectories();
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(prefix + aliasCommand, "").trim();
  const args = content.split(" ");
  const quote = message.data?.quote || message.reply;
  if (quote && quote.attach) {
    try {
      const attachData = JSON.parse(quote.attach);
      if (attachData.href && attachData.params) {
        let fileUrl = attachData.href.trim();
        fileUrl = addFileExtensionIfNeeded(fileUrl);
        const fileExt = await checkExstentionFileRemote(fileUrl);

        let voiceUrl = fileUrl;

        if (fileExt === "aac") {
          if (!voiceUrl.endsWith("/NguyenPhiHoang.aac")) {
            voiceUrl += "/NguyenPhiHoang.aac";
          }
        }
        else if (ALLOWED_AUDIO_EXT.includes(fileExt)) {
          const fileName = `temp_audio_${Date.now()}.${fileExt}`;
          const filePath = path.join(TEMP_AUDIO_PATH, fileName);
          await downloadFile(fileUrl, filePath);
          let uploadedUrl = await uploadAudioFile(filePath, api, message);
          if (uploadedUrl) {
            voiceUrl = uploadedUrl;
            voiceUrl = addFileExtensionIfNeeded(voiceUrl);
          }
          fs.unlinkSync(filePath);
        } 
        else if (["mp4", "mkv", "avi", "mov"].includes(fileExt)) {
          await handleGetVoiceCommand(api, message, aliasCommand);
          return;
        } 
        else {
          await sendMessageFailed(api, message, `❌ Định dạng không được hỗ trợ: ${fileExt}`);
          return;
        }
        await sendVoiceMusic(api, message, { voiceUrl, caption: `🎤 Voice từ file của bạn đây!` }, 1800000);
        return;
      }
    } catch (error) {
      console.error(error);
    }
  }

  if (args[0]?.startsWith("http")) {
    let fileUrl = args[0].trim();
    fileUrl = addFileExtensionIfNeeded(fileUrl);
    const fileExt = await checkExstentionFileRemote(fileUrl);
    if (ALLOWED_AUDIO_EXT.includes(fileExt) && fileExt !== "aac") {
      const fileName = `temp_audio_${Date.now()}.${fileExt}`;
      const filePath = path.join(TEMP_AUDIO_PATH, fileName);
      await downloadFile(fileUrl, filePath);
      let uploadedUrl = await uploadAudioFile(filePath, api, message);
      if (uploadedUrl) {
        fileUrl = uploadedUrl;
        fileUrl = addFileExtensionIfNeeded(fileUrl); 
      }
      fs.unlinkSync(filePath);
    }
    await sendVoiceMusic(api, message, { voiceUrl: fileUrl, caption: "🎤 Đây là voice từ link của bạn" }, 1800000);
    return;
  }
  const voiceFiles = getVoiceFiles();

  if (voiceFiles.length === 0) {
    await sendMessageFailed(api, message, "❌ Không có file voice nào trong thư mục.");
    return;
  }
  if (!content) {
    const fileList = voiceFiles.map((v, i) => `${i + 1}. ${v.name}`).join("\n");
    await sendMessageCompleteRequest(api, message, {
      caption: `📢 Danh sách voice có sẵn:\n${fileList}\n\n📌 Dùng lệnh: \`${prefix}${aliasCommand} <số hoặc tên>\` để phát.`
    }, 1800000);
    return;
  }
  let selected;
  if (!isNaN(content)) {
    const index = parseInt(content) - 1;
    if (index >= 0 && index < voiceFiles.length) {
      selected = voiceFiles[index];
    }
  } else {
    selected = voiceFiles.find(v => v.name.toLowerCase() === content.toLowerCase());
  }

  if (!selected) {
    const fileList = voiceFiles.map((v, i) => `${i + 1}. ${v.name}`).join("\n");
    await sendMessageCompleteRequest(api, message, {
      caption: `❌ Không tìm thấy voice này!\n📢 Danh sách voice có sẵn:\n${fileList}\n\n📌 Dùng lệnh: \`${prefix}${aliasCommand} <số hoặc tên>\` để phát.`
    }, 1800000);
    return;
  }

  let uploadedUrl = await uploadAudioFile(selected.fullPath, api, message);
  if (!uploadedUrl) {
    await sendMessageFailed(api, message, "❌ Không thể upload file.");
    return;
  }
  uploadedUrl = addFileExtensionIfNeeded(uploadedUrl);

  await sendVoiceMusic(api, message, {
    voiceUrl: uploadedUrl,
    caption: `🎤 Voice "${selected.name}" của bạn đây!`
  }, 1800000);
}
