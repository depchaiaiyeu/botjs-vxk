import axios from "axios";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageFailed, sendMessageQuery, sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle, MessageMention } from "../../../api-zalo/index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_PINK = "FF1493";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

const gptApiUrl = "https://api.zeidteam.xyz/ai/chatgpt4";

export async function askGPTCommand(api, message) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  const question = content.replace(`${prefix}gpt`, "").trim();
  
  if (!question) {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }
  
  try {
    let replyText = await callGPTAPI(question, message);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}

export async function callGPTAPI(question, message) {
  const userName = message?.data?.dName || "Người dùng";
  const userQuestion = question || message?.data?.content || "";
  
  const prompt = `Bạn tên là ChatGPT, được tạo ra duy nhất bởi Vũ Xuân Kiên. Trả lời dễ thương, có thể dùng emoji để tăng tính tương tác.
Người hỏi: ${userName}
Câu hỏi: ${userQuestion}`;
  
  try {
    const response = await axios.get(gptApiUrl, {
      params: {
        prompt: prompt
      }
    });
    
    const json_data = response.data;
    
    if (json_data.status && json_data.response) {
      return json_data.response;
    }
    
    return null;
  } catch (error) {
    console.error("Lỗi khi gọi API GPT:", error);
    return null;
  }
}

export async function askGemini(api, message) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  const question = content.replace(`${prefix}gpt`, "").trim();
  
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }
  
  try {
    const replyText = await callGPTAPI(question, message);
    if (!replyText) {
      throw new Error("Không nhận được phản hồi từ API");
    }
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}
