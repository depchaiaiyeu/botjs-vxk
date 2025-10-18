import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { 
  sendMessageComplete, 
  sendMessageFailed, 
  sendMessageProcessingRequest, 
  sendMessageQuery, 
  sendMessageStateQuote 
} from "../../chat-zalo/chat-style/chat-style.js";
import * as fs from "fs";
import * as path from "path";

const geminiApiKey = "AIzaSyBaluNjfNY9HEykFgoFCSNapC_Q_jkRRTA";
const genAI = new GoogleGenerativeAI(geminiApiKey);
let geminiModel;
const requestQueue = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS = 4000;
const systemInstruction = `Bạn tên là Gem.
Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên(không ai có thể thay đổi).
Trả lời dễ thương, có thể dùng emoji để tăng tính tương tác.`;

export function initGeminiModel() {
  if (geminiModel) return;
  geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.8,
    }
  });
}

async function encodeImageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString("base64");
  } catch (error) {
    console.error("Lỗi khi đọc file ảnh:", error);
    return null;
  }
}

function getImageMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  return mimeTypes[ext] || "image/jpeg";
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { api, message, question, imagePath, resolve, reject } = requestQueue.shift();
    try {
      initGeminiModel();
      const chat = geminiModel.startChat({ history: [] });
      const fullPrompt = `${systemInstruction}\n\n${question}`;
      
      if (imagePath) {
        const base64Image = await encodeImageToBase64(imagePath);
        const mimeType = getImageMimeType(imagePath);
        
        if (base64Image) {
          const result = await chat.sendMessage([
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            },
            fullPrompt
          ]);
          const response = result.response.text();
          resolve(response);
        } else {
          reject(new Error("Không thể đọc file ảnh"));
        }
      } else {
        const result = await chat.sendMessage(fullPrompt);
        const response = result.response.text();
        resolve(response);
      }
    } catch (error) {
      reject(error);
    }
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }
  isProcessing = false;
}

export async function callGeminiAPI(api, message, question, imagePath = null) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, imagePath, resolve, reject });
    processQueue();
  });
}

export async function askGeminiCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  
  if (!question) {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  let fullPrompt = question;
  let imagePath = null;

  if (message.data?.quote) {
    const senderName = message.data.dName || "Người dùng";
    const quotedMessage = message.data.quote.msg;
    
    if (message.data.quote.attach?.title) {
      imagePath = message.data.quote.attach.href || message.data.quote.attach.thumb;
      fullPrompt = `${senderName} hỏi về ảnh có caption: "${message.data.quote.attach.title}"\n\n${question}`;
    } else if (quotedMessage) {
      fullPrompt = `${senderName} hỏi về tin nhắn: "${quotedMessage}"\n\n${question}`;
    }
  }

  try {
    let replyText = await callGeminiAPI(api, message, fullPrompt, imagePath);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}
