import { GoogleGenAI, Modality } from "@google/genai";
import {
  sendMessageWarningRequest,
  sendMessageFailed,
  sendMessageCompleteRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs";
import path from "path";
import axios from "axios";

const genAI = new GoogleGenAI({
  apiKey: "AIzaSyD197uMmcZj-i1WX5dv6wK-JMBGaB0jIvo", // THAY KEY
});

export async function handleImageGeneration(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const prompt = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const threadId = message.threadId;
  const quote = message.data?.quote;

  if (!prompt) {
    return sendMessageWarningRequest(api, message, {
      caption: `Vui lòng nhập mô tả ảnh cần tạo.\nVí dụ:\n${prefix}${aliasCommand} một con rồng đang chơi guitar`,
    }, 30000);
  }

  const contents = [{ text: prompt }];
  if (quote?.attach) {
    try {
      const attachData = JSON.parse(quote.attach);
      const imageUrl =
        attachData.hdUrl ||
        attachData.href ||
        attachData.oriUrl ||
        attachData.normalUrl ||
        attachData.thumbUrl;

      if (imageUrl) {
        const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
        const base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");

        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        });
      }
    } catch (err) {
      console.warn("Không thể xử lý ảnh từ quote.attach:", err.message);
    }
  }

  let retryCount = 0;
  const maxRetries = 3;
  let imagePath = null;
  let fallbackText = "";

  while (retryCount < maxRetries) {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash-exp-image-generation",
        contents,
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];
      fallbackText = parts.find(p => p.text)?.text?.trim() || "";

      for (const part of parts) {
        if (part.inlineData?.data) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");

          const tempDir = path.resolve("project/assets/temp");
          fs.mkdirSync(tempDir, { recursive: true });

          imagePath = path.join(tempDir, `genimg_${Date.now()}.png`);
          fs.writeFileSync(imagePath, buffer);
          break;
        }
      }

      if (imagePath) break;

      console.warn(`Không tạo được ảnh, thử lại lần ${retryCount + 1}`);
      retryCount++;
    } catch (err) {
      console.error(`Lỗi thử lần ${retryCount + 1}:`, err.message);
      retryCount++;
    }
  }

  if (!imagePath) {
    if (fallbackText) {
      return sendMessageCompleteRequest(api, message, {
        caption: fallbackText,
      }, 30000);
    }
    return sendMessageFailed(api, message, "API Quá tải vui lòng thử lại sau...");
  }

  await sendMessageCompleteRequest(api, message, {
    caption: `Ảnh đã được tạo theo từ khóa: ${prompt}`,
  }, 30000);

  await api.sendMessage(
    {
      msg: "",
      attachments: [imagePath],
      ttl: 3600000,
    },
    threadId,
    message.type
  );

  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
}
