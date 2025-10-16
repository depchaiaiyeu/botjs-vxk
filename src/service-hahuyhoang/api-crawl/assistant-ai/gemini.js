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

const geminiApiKey = "AIzaSyBaluNjfNY9HEykFgoFCSNapC_Q_jkRRTA";
const genAI = new GoogleGenerativeAI(geminiApiKey);
let geminiModel;
const requestQueue = [];
let isProcessing = false;
const DELAY_THINKING = 0;
const DELAY_BETWEEN_REQUESTS = 4000;

export function initGeminiModel() {
  if (geminiModel) return;
  const systemInstruction = `Bạn tên là Gem.
Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên.
Trả lời dễ thương, có thể dùng emoji để tăng tính tương tác.`;
  geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.8,
    },
    systemInstruction
  });
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { api, message, question, resolve, reject } = requestQueue.shift();
    if (DELAY_THINKING > 0) {
      await sendMessageProcessingRequest(api, message, {
        caption: "Chờ suy nghĩ xíu..."
      }, DELAY_THINKING);
      await new Promise(r => setTimeout(r, DELAY_THINKING));
    }
    try {
      initGeminiModel();
      const chat = geminiModel.startChat({ history: [] });
      const result = await chat.sendMessage(question);
      const response = result.response.text();
      resolve(response);
    } catch (error) {
      reject(error);
    }
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }
  isProcessing = false;
}

export async function callGeminiAPI(api, message, question) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, resolve, reject });
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
  try {
    let replyText = await callGeminiAPI(api, message, question);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}
