import axios from "axios";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  sendMessageFailed,
  sendMessageWarning,
  sendMessageComplete
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { checkExstentionFileRemote } from "../../utils/util.js";

const genAI = new GoogleGenerativeAI("AIzaSyBKNInWVa8kKm9G0e9Kz7_VxQkgpFY6gDs");

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "jxl"];

export async function handleImageAnalytics(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, '').trim();
  const quote = message.data?.quote;

  if (!content && !quote) {
    return sendMessageWarning(api, message, {
      caption: `Vui lòng nhập câu hỏi hoặc reply vào tin nhắn có hình ảnh để phân tích.\nVí dụ:\n${prefix}${aliasCommand} Đây là gì?`,
    }, 30000);
  }

  let quoteText = "";
  if (!content && quote?.msg) quoteText = quote.msg;

  try {
    const parts = [];
    const userInput = content || quoteText;
    if (userInput) {
      if (userInput.length > 10000) {
        return sendMessageWarning(api, message, {
          caption: "Nội dung quá dài, vui lòng rút gọn lại!",
        }, 30000);
      }
      parts.push({ text: `${userInput}\n\n(Trả lời bằng tiếng Việt, ngắn gọn, có thể thêm Emoji để tăng tính tương tác)` });
    }

    let modelName = "gemini-2.0-flash";
    let mimeType = "image/png";

    if (quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      let fileUrl =
        attachData.hdUrl ||
        attachData.href ||
        attachData.oriUrl ||
        attachData.normalUrl ||
        attachData.thumbUrl;

      if (fileUrl) {
        let extension = await checkExstentionFileRemote(fileUrl);
        if (extension === "jxl") {
          fileUrl = fileUrl.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg");
          extension = "jpg";
        }
        const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);

        if (!isImage) {
          return sendMessageWarning(api, message, {
            caption: `File không hỗ trợ. Chỉ hỗ trợ hình ảnh (.jpg, .png..., .jxl) dưới 20MB.`,
          }, 30000);
        }

        mimeType = extension === "jpg" || extension === "jxl" ? "image/jpeg" : `image/${extension}`;

        const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
        const fileSizeMB = response.data.byteLength / (1024 * 1024);
        if (fileSizeMB > 20) {
          return sendMessageWarning(api, message, {
            caption: `File quá lớn (${fileSizeMB.toFixed(2)} MB). Vui lòng gửi file dưới 20MB.`,
          }, 30000);
        }

        const tempDir = path.resolve("assets/temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempPath = path.join(tempDir, `tempfile.${extension}`);
        fs.writeFileSync(tempPath, response.data);

        const base64 = fs.readFileSync(tempPath, { encoding: "base64" });

        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });

        fs.unlinkSync(tempPath);
      }
    }

    const model = genAI.getGenerativeModel({ model: modelName });

    let replyText = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Gọi Gemini attempt ${attempt}...`);
        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });

        replyText = result.response.text();
        break;
      } catch (err) {
        console.warn(`Thử lần ${attempt} thất bại:`, err.message);
        if (attempt === maxRetries) {
          throw err; 
        }
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }

    return await sendMessageComplete(api, message, { caption: replyText }, 3000000);
  } catch (err) {
    console.error("Lỗi xử lý Gemini:", err.message);
    return sendMessageFailed(api, message, "API Quá tải vui lòng thử lại sau...");
  }
}
