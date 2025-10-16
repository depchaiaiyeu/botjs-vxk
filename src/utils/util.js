import FormData from "form-data";
import axios from "axios";
import fs from "fs";
import path from "path";
import { tempDir } from "./io-json.js";
import { exec } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { analyzeLinks } from "../api-zalo/utils.js";
import { getRecentMessage } from "../commands/bot-manager/recent-message.js";
import { getBotId } from "../index.js";

export async function checkUrlStatus(url) {
	try {
		const response = await axios.head(url, {
			timeout: 5000,
		});
		return response.status === 200;
	} catch (error) {
		console.log(`Link đã gãy hoặc timeout: ${url}`);
		return false;
	}
}

export function checkLinkIsValid(content) {
  try {
    if (!content || typeof content !== 'string') return false;
    content = content.trim();
    if (!content.match(/^https?:\/\//i)) {
      content = 'https://' + content;
    }
    new URL(content);
    return true;
  } catch {
    return false;
  }
}

export const execAsync = promisify(exec);

export async function uploadTempFile(pathLocal, serviceType = 1) {
  // const startTime = performance.now();
  let result = null;

  try {
    if (serviceType === 2) result = await uploadToTmpFile(pathLocal);
  } catch (error) {
    result = await uploadToUguu(pathLocal);
  }
  try {
    if (serviceType === 1) result = await uploadToUguu(pathLocal);
  } catch (error) {
    result = await uploadToTmpFile(pathLocal);
  }

  // const endTime = performance.now();
  // const duration = (endTime - startTime) / 1000;

  // if (duration.toFixed(2) > 1) {
  //   console.log(`⏱️ Thời gian upload file bằng service ${serviceType}: ${duration.toFixed(2)} giây`);
  // }
  return result;
}

/**
 * Upload file lên tmpfiles.org
 */

export async function uploadToTmpFile(pathLocal) {
  try {
    const fileName = path.basename(pathLocal);
    const buffer = fs.createReadStream(pathLocal);
    const formData = new FormData();
    formData.append("file", buffer, {
      filename: fileName,
    });

    const response = await axios.post("https://tmpfiles.org/api/v1/upload", formData, {
      headers: formData.getHeaders(),
    });

    if (response.status === 200 && response.data.data.url) {
      const downloadUrl = response.data.data.url.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
      return downloadUrl;
    } else {
      console.error("Lỗi khi upload:", response.data);
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi upload lên dịch vụ tempfile:", error);
    return null;
  }
}


 /* 
 Upload file lên uguu.se
 */
export async function uploadToUguu(pathLocal) {
  try {
    const fileName = path.basename(pathLocal);
    const buffer = fs.createReadStream(pathLocal);

    const formData = new FormData();
    formData.append("files[]", buffer, fileName);
    formData.append("randomname", "true");

    const response = await axios.post("https://uguu.se/upload.php", formData, {
      headers: {
        ...formData.getHeaders(),
        accept: "application/json",
      },
    });

    if (response.status === 200 && response.data) {
      return response.data.files[0].url;
    } else {
      console.error("Lỗi upload:", response.data);
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi upload lên Uguu:", error.message);
    return null;
  }
}  

/**
 * Download file từ URL và lưu vào file với các options phù hợp theo loại file
 */
export async function downloadFile(url, filepath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  const tempFilePath = filepath || path.join(tempDir, `fileDownload_${Date.now()}.${checkExstentionFileRemote(url)}`);
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    writer.on("finish", () => {
      resolve(tempFilePath);
    });
    writer.on("error", reject);
  });
}
export async function downloadFileFake(url, filepath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  const tempFilePath = filepath || path.join(tempDir, `fileDownload_${Date.now()}.${checkExstentionFileRemote(url)}`);
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    writer.on("finish", () => {
      resolve(tempFilePath);
    });
    writer.on("error", reject);
  });
}
/**
 * Download video từ URL và lưu vào file
 */
export async function downloadAndSaveVideo(videoUrl) {
  const videoResponse = await axios({
    method: "GET",
    url: videoUrl,
    responseType: "arraybuffer",
  });

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const tempFilePath = path.join(tempDir, `video_${Date.now()}.mp4`);
  fs.writeFileSync(tempFilePath, videoResponse.data);

  return tempFilePath;
}

/**
 * Xóa file theo đường dẫn
 */
export async function deleteFile(pathFile) {
  if (!pathFile) return;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      if (fs.existsSync(pathFile)) {
        fs.unlinkSync(pathFile);
        if (!fs.existsSync(pathFile)) {
          return;
        }
      } else {
        return;
      }
    } catch (error) {
    }
    attempts++;

    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Kiểm tra định dạng file từ URL remote
 */

export async function checkExstentionFileRemote(url) {
  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/jxl": "jxl",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "weba",
    "audio/aac": "aac",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-rar-compressed": "rar",
    "application/x-7z-compressed": "7z",
    "application/x-tar": "tar",
    "application/x-gzip": "gz",
    "application/x-bzip2": "bz2",
    "application/x-xz": "xz"
  };

  const maxAttempts = 3;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      let response;
      try {
        // Thử HEAD trước (nhanh hơn)
        response = await axios.head(url, { timeout: 7000, maxRedirects: 3 });
      } catch {
        // Nếu HEAD bị chặn → fallback GET nhẹ
        response = await axios.get(url, {
          timeout: 7000,
          maxRedirects: 3,
          responseType: "stream"
        });
      }

      const headers = response.headers || {};
      const contentType = headers["content-type"]?.toLowerCase() || "";
      const contentDisposition = headers["content-disposition"] || "";

      // Nếu Content-Type khớp MIME → trả về ngay
      if (mimeToExt[contentType]) {
        response.data?.destroy?.();
        return mimeToExt[contentType];
      }

      // Nếu là octet-stream → dò filename trong Content-Disposition
      if (contentType.includes("octet-stream") && contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=["']?([^"']+)["']?/i);
        if (filenameMatch && filenameMatch[1]) {
          const extension = filenameMatch[1].split(".").pop().toLowerCase();
          response.data?.destroy?.();
          return extension;
        }
      }

      // Nếu không có Content-Disposition, thử lấy từ URL
      const urlExt = url.split("?")[0].split(".").pop().toLowerCase();
      if (urlExt && urlExt.length <= 5 && /^[a-z0-9]+$/i.test(urlExt)) {
        response.data?.destroy?.();
        return urlExt;
      }

      response.data?.destroy?.();
      return null;
    } catch (error) {
      if (attempts === maxAttempts - 1) {
        console.error("❌ Lỗi khi kiểm tra định dạng file:", error.message);
        return null;
      }
      // Đợi chút rồi thử lại
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return null;
}

/**
 * Tải và chuyển đổi ảnh sang PNG buffer từ đường dẫn hoặc URL
 * @param {string} source - Đường dẫn file hoặc URL của ảnh
 * @returns {Promise<Buffer>} Buffer dạng PNG của ảnh
 */
export async function loadImageBuffer(source) {
  try {
    let buffer;

    if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await axios({
        url: source,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 3000
      });
      buffer = Buffer.from(response.data);
    } else {
      buffer = await fs.promises.readFile(source);
    }

    const pngBuffer = await sharp(buffer)
      .png()
      .toBuffer();

    return pngBuffer;
  } catch (error) {
    console.error("Lỗi khi xử lý ảnh:", error.message);
    return null;
  }
}

/**
 * Lấy thông tin kích thước và dung lượng của ảnh thông qua ffmpeg
 * @param {string} imageUrl - URL hoặc đường dẫn của ảnh
 * @returns {Promise<{width: number, height: number, totalSize: number}>} Thông tin kích thước và dung lượng của ảnh
 */
export async function getImageInfo(imageUrl) {
  try {
    const response = await axios.head(imageUrl);
    const totalSize = parseInt(response.headers['content-length'] || 0);

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    const metadata = await sharp(Buffer.from(imageResponse.data)).metadata();

    return {
      width: metadata.width || 500,
      height: metadata.height || 500,
      totalSize: totalSize || 0
    };
  } catch (error) {
    console.error("Lỗi khi lấy thông tin ảnh:", error.message);
    return null;
  }
}
export async function deleteRepliedMessage(api, message) {
  try {
    if (message?.data?.quote?.globalMsgId) {
      const idBot = getBotId();
      const quotedMsgId = message.data.quote.globalMsgId;

      const recentMessages = await getRecentMessage(api, message, 50);

      const messageToDelete = recentMessages.find(msg => msg.msgId.toString() === quotedMsgId.toString());
      if (messageToDelete) {
        const msgDel = {
          type: messageToDelete.type || message.type,
          threadId: message.threadId,
          data: {
            cliMsgId: messageToDelete.cliMsgId,
            msgId: messageToDelete.msgId,
            uidFrom: messageToDelete.uidFrom === "0" ? idBot : messageToDelete.uidFrom,
          },
        };

        await api.deleteMessage(msgDel, false).catch(err => {
          console.error("Lỗi khi xóa tin nhắn reply:", err);
        });
      }
    }
  } catch (error) {
    console.error("Lỗi khi xóa tin nhắn reply:", error);
  }
}
export async function uploadFileOnly(api, filePath, threadId, messageType) {
  if (!fs.existsSync(filePath)) {
    const msg = `❌ File không tồn tại: ${filePath}`;
    console.error("[uploadFileOnly]", msg);
    throw new Error(msg);
  }

 // console.log(`[uploadFileOnly] 📤 Bắt đầu upload file: ${filePath}`);

  try {
    const uploaded = await api.uploadAttachment([filePath], threadId, messageType);

    if (uploaded && uploaded.length > 0 && uploaded[0].fileUrl) {
      const fileInfo = uploaded[0];
      console.log(`[uploadFileOnly] Upload thành công:`, 
        {
        fileUrl: fileInfo.fileUrl,
        fileName: fileInfo.fileName,
        totalSize: fileInfo.totalSize,
        checksum: fileInfo.checksum
      });
      return fileInfo;
    } else {
      const msg = "❌ Upload thất bại: Không có fileUrl trả về.";
      console.error("[uploadFileOnly]", msg);
      throw new Error(msg);
    }
  } catch (err) {
    console.error("[uploadFileOnly] ❌ Lỗi upload:", err.message);
    throw err;
  }
}
