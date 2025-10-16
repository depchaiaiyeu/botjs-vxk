import fs from "fs";
import path from "path";
import FormData from "form-data";
import { appContext } from "../context.js";
import { ZaloApiError } from "../index.js";
import {
  encodeAES,
  decodeAES,
  getFileSize,
  getImageMetaData,
  makeURL,
  request
} from "../utils.js";

export function uploadToZCloudFactory(api) {
  const uploadUrlBase = "https://tt-files-wpa.chat.zalo.me/api/message/photo_original/upload";

  return async function uploadToZCloud(filePaths) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent) {
      throw new ZaloApiError("Thiếu thông tin app context");
    }

    if (!filePaths?.length) throw new ZaloApiError("Thiếu filePaths");

    const results = [];

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) throw new ZaloApiError(`Không tìm thấy file: ${filePath}`);

      const extFile = path.extname(filePath).slice(1).toLowerCase();
      const originalFileName = path.basename(filePath);
      const safeFileName = originalFileName
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w.\-]/g, "_");

      const totalSize = await getFileSize(filePath);
      let fileData = { fileName: safeFileName, totalSize };

      if (["jpg", "jpeg", "png", "webp"].includes(extFile)) {
        const imageData = await getImageMetaData(filePath);
        fileData = { ...imageData, fileName: safeFileName, totalSize };
      }

      const params = {
        imei: appContext.imei,
        jxl: 0,
        isE2EE: 0,
        clientId: Date.now(),
        fileName: safeFileName,
        totalSize,
        chunkId: 1,
        totalChunk: 1,
        fileType: "photo"
      };

      console.log("🧪 Params gửi lên:", JSON.stringify(params, null, 2));

      const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
      if (!encryptedParams) throw new ZaloApiError("Mã hóa params thất bại");

      const form = new FormData();
      form.append("chunkContent", fs.createReadStream(filePath), {
        filename: safeFileName,
        contentType: "application/octet-stream"
      });

      const uploadUrl = makeURL(uploadUrlBase, {
        zpw_ver: 657,
        zpw_type: 30,
        params: encryptedParams,
        type: 2
      });

      console.log("📤 Bắt đầu upload ZCloud:", {
        fileName: safeFileName,
        totalSize,
        uploadUrl
      });

      try {
        const response = await request(uploadUrl, {
          method: "POST",
          headers: {
            ...form.getHeaders(),
            cookie: appContext.cookie,
            "user-agent": appContext.userAgent,
            origin: "https://chat.zalo.me"
          },
          body: form
        });

        const text = await response.text();
        console.log("📥 Phản hồi thô (raw text):", text);

        let result;
        try {
          result = JSON.parse(text);
        } catch (jsonErr) {
          console.error("❌ Không phải JSON:", jsonErr.message);
          throw new ZaloApiError("Phản hồi không phải JSON hợp lệ");
        }

        if (result.error_code !== 0) {
          throw new ZaloApiError(result.error_message || "Lỗi không xác định", result.error_code);
        }

        let data = result.data;
        if (typeof data === "string") {
            try {
              const decrypted = decodeAES(appContext.secretKey, data);
              console.log("🔓 Phản hồi đã giải mã:", decrypted);
              const parsed = JSON.parse(decrypted);
          
              // Nếu sau khi giải mã vẫn có error_code thì trả lỗi ra luôn
              if (parsed?.error_code && parsed?.error_code !== 0) {
                throw new ZaloApiError(parsed.error_message || "Lỗi sau khi giải mã", parsed.error_code);
              }
          
              data = parsed;
            } catch (err) {
              console.error("❌ Giải mã thất bại:", err.message);
              throw new ZaloApiError("Giải mã phản hồi thất bại");
            }
          }

        const fileUrl = data?.fileUrl || data?.normalUrl;
        if (!fileUrl) {
          console.warn("⚠️ Không có fileUrl trong phản hồi:", data);
          throw new ZaloApiError("Không nhận được fileUrl từ phản hồi");
        }

        const resultEntry = {
          ...fileData,
          fileType: "photo",
          fileUrl,
          width: data.width,
          height: data.height,
          photoId: data.photoId,
          fileId: data.fileId
        };

        console.log("✅ Upload thành công:", resultEntry);
        results.push(resultEntry);

      } catch (err) {
        console.error(`❌ Upload thất bại cho file ${safeFileName}:`, err);
      }
    }

    return results;
  };
}
