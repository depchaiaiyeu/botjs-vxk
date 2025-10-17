import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getGlobalPrefix } from "../../../service.js";
import { checkExstentionFileRemote, deleteFile, downloadFileFake, execAsync } from "../../../../utils/util.js";
import { MessageType } from "../../../../api-zalo/index.js";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";
import { isAdmin } from "../../../../index.js";
import { removeBackground } from "./remove-background.js";
import { sendMessageComplete, sendMessageProcessingRequest, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js";

export async function isValidMediaUrl(url) {
  try {
    const ext = await checkExstentionFileRemote(url);
    if (!ext) return { isValid: false, isVideo: false };

    if (["mp4", "mov", "webm"].includes(ext)) {
      return { isValid: true, isVideo: true };
    } else if (["png", "jpg", "jpeg", "gif", "webp", "jxl"].includes(ext)) {
      return { isValid: true, isVideo: false };
    } else {
      return { isValid: false, isVideo: false };
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra URL:", error);
    return { isValid: false, isVideo: false };
  }
}

async function convertJxlToPng(inputPath, outputPath) {
  try {
    await execAsync(`cjxl "${inputPath}" "${outputPath}"`);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error("File PNG không được tạo sau khi chuyển đổi JXL");
    }
    
    console.log("Đã chuyển .jxl sang .png thành công bằng cjxl!");
    return true;
  } catch (cjxlError) {
    console.warn("cjxl thất bại, thử dùng ImageMagick...", cjxlError.message);
    
    try {
      await execAsync(`magick convert "${inputPath}" "${outputPath}"`);
      
      if (!fs.existsSync(outputPath)) {
        throw new Error("File PNG không được tạo bằng ImageMagick");
      }
      
      console.log("Đã chuyển .jxl sang .png thành công bằng ImageMagick!");
      return true;
    } catch (magickError) {
      console.warn("ImageMagick thất bại, thử dùng sharp...", magickError.message);
      
      try {
        const buffer = fs.readFileSync(inputPath);
        await sharp(buffer)
          .png()
          .toFile(outputPath);
        
        if (!fs.existsSync(outputPath)) {
          throw new Error("File PNG không được tạo bằng sharp");
        }
        
        console.log("Đã chuyển .jxl sang .png thành công bằng sharp!");
        return true;
      } catch (sharpError) {
        console.error("Tất cả phương pháp chuyển đổi đều thất bại:", {
          cjxl: cjxlError.message,
          magick: magickError.message,
          sharp: sharpError.message
        });
        return false;
      }
    }
  }
}

export async function processAndSendSticker(api, message, mediaUrl, params) {
  const threadId = message.threadId;
  let pathSticker = path.join(tempDir, `sticker_${Date.now()}.templink`);

  try {
    let ext = await checkExstentionFileRemote(mediaUrl);
    pathSticker = path.join(tempDir, `sticker_${Date.now()}.${ext}`);
    
    await downloadFileFake(mediaUrl, pathSticker);

    if (ext === "jxl") {
      const convertedPath = path.join(tempDir, `sticker_${Date.now()}.jpg`);
      const convertSuccess = await convertJxlToPng(pathSticker, convertedPath);
      
      if (!convertSuccess) {
        throw new Error("Không thể chuyển định dạng .jxl sang .jpg sau khi thử tất cả phương pháp");
      }
      
      await deleteFile(pathSticker);
      pathSticker = convertedPath;
      ext = "jpg";
    }

    const finalUrl = mediaUrl + "?createdBy=Vu-Xuan-Kien-Service.BOT";

    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true);
    await api.sendCustomSticker(
      message,
      finalUrl,
      finalUrl,
      params.width,
      params.height
    );

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error);
    throw error;
  } finally {
    await deleteFile(pathSticker);
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data.quote;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const isAdminBot = isAdmin(senderId, threadId);
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const tempPath = path.join(tempDir, `sticker_${Date.now()}.png`);

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`, true);
    return;
  }

  const attach = quote.attach;
  if (!attach) {
    await sendMessageWarning(api, message, `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`, true);
    return;
  }

  try {
    const attachData = JSON.parse(attach);
    const mediaUrl = attachData.hdUrl || attachData.href;

    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true);
      return;
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"));
    const mediaCheck = await isValidMediaUrl(decodedUrl);

    if (!mediaCheck.isValid) {
      await sendMessageWarning(api, message, `${senderName}, URL không hợp lệ hoặc không phải là ảnh, GIF hoặc video được hỗ trợ!\nLink: ${decodedUrl}`, true);
      return;
    }

    const isVideo = mediaCheck.isVideo;
    const isXoaPhong = content.includes("xp");
    const params = attachData.params || {};

    if (isXoaPhong && isVideo) {
      await sendMessageWarning(api, message, `Nhóc con ${senderName}, Đại ca tao chưa hỗ trợ xóa phông cho sticker video!`, true);
      return;
    }

    if (isVideo && params.duration > 5000) {
      await sendMessageWarning(api, message, `${senderName}, Video phải dưới 5 giây để tạo sticker video.`, true);
      return;
    }

    await sendMessageProcessingRequest(api, message, { caption: `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!` }, 6000);

    if (isXoaPhong) {
      const imageData = await removeBackground(decodedUrl);
      if (!imageData) {
        await sendMessageFailed(api, message, `${senderName}, Mọe xóa phông lỗi hoặc hết cụ mịa ròi.`, true);
        return;
      }
      fs.writeFileSync(tempPath, imageData);
      await processAndSendSticker(api, message, tempPath, params);
    } else {
      await processAndSendSticker(api, message, decodedUrl, params);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error);
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true);
  } finally {
    await deleteFile(tempPath);
  }
}
