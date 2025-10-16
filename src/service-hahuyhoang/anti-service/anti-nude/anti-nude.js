import path from "path";
import axios from "axios";
import chalk from "chalk";
import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotdqt";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamImage } from "../../../utils/canvas/event-image.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { getGroupInfoData } from "../../info-service/group-info.js";
import { getUserInfoData } from "../../info-service/user-info.js";
import { checkExstentionFileRemote } from "../../../utils/util.js";
import { isInWhiteList } from "../white-list.js";
import { removeMention } from "../../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenerativeAI("AIzaSyBKNInWVa8kKm9G0e9Kz7_VxQkgpFY6gDs");

const blockedUsers = new Set();

export const PERCENT_NSFW = 40;

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

async function loadViolations() {
  const antiState = getAntiState();
  return antiState.data.violationsNude || {};
}

async function saveViolation(senderId, count, senderName, threadId) {
  const antiState = getAntiState();
  const violations = antiState.data.violationsNude || {};

  violations[senderId] = {
    count,
    lastViolation: Date.now(),
    senderName,
    threadId
  };

  updateAntiConfig({
    ...antiState.data,
    violationsNude: violations
  });
}

async function checkNudeImageWithGemini(fileUrl) {
  try {
    const extension = await checkExstentionFileRemote(fileUrl);
    const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);

    if (!isImage) {
      return { isNude: false, percentage: 0 };
    }

    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const fileSizeMB = response.data.byteLength / (1024 * 1024);
    
    if (fileSizeMB > 20) {
      return { isNude: false, percentage: 0 };
    }

    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = extension === "gif" ? "image/gif" : `image/${extension === "jpg" ? "jpeg" : extension}`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const parts = [
      {
        text: `Bạn là Gem, chức năng là phân tích ảnh nhạy cảm (nude/NSFW).
Nhiệm vụ: Ước lượng tỉ lệ nude trong ảnh.

Quy tắc trả lời:
- Nếu ảnh có nội dung nude/NSFW: Chỉ trả về số % (ví dụ: 75)
- Nếu ảnh KHÔNG có nội dung nude: Chỉ trả về chữ "Không"

Lưu ý:
- Chỉ trả về số % hoặc chữ "Không", không thêm bất kỳ từ nào khác
- Tỉ lệ % phải từ 1-100
- Nude bao gồm: khỏa thân, nội y, tư thế gợi dục, bộ phận nhạy cảm lộ liễu`
      },
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ];

    const maxRetries = 3;
    let replyText = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });

        replyText = result.response.text().trim();
        console.log(`Gemini response (attempt ${attempt}):`, replyText);
        break;
      } catch (err) {
        console.warn(`Thử lần ${attempt} thất bại:`, err.message);
        if (attempt === maxRetries) {
          throw err;
        }
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }

    if (!replyText) {
      return { isNude: false, percentage: 0 };
    }

    const lowerText = replyText.toLowerCase().trim();
    
    if (lowerText === "không" || lowerText.includes("không")) {
      console.log(`Ảnh an toàn, không phải nude`);
      return { isNude: false, percentage: 0 };
    }

    const percentMatch = replyText.match(/(\d+)/);
    if (percentMatch) {
      const percentage = parseInt(percentMatch[1]);
      if (percentage >= 1 && percentage <= 100) {
        console.log(`Phát hiện nude: ${percentage}%`);
        return { isNude: true, percentage };
      }
    }

    console.log(`Không thể phân tích response, coi như ảnh an toàn`);
    return { isNude: false, percentage: 0 };
  } catch (error) {
    console.error("Lỗi khi phân tích ảnh với Gemini:", error);
    return { isNude: false, percentage: 0 };
  }
}

export async function antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (
    (message.data.msgType != "chat.photo" && message.data.msgType != "chat.gif") ||
    isAdminBox ||
    isSelf ||
    !botIsAdminBox
  )
    return false;

  const isWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  let percentNsfw = PERCENT_NSFW;
  if (isWhiteList) percentNsfw = 60;

  if (groupSettings[threadId]?.antiNude) {
    const linkImage = message.data.content.href;
    const thumbnail = message.data.content.thumb;

    if (linkImage || thumbnail) {
      try {
        const checkUrl = linkImage || thumbnail;
        console.log(`Đang kiểm tra ảnh từ ${senderName}:`, checkUrl);
        const { isNude, percentage } = await checkNudeImageWithGemini(checkUrl);

        console.log(`Kết quả kiểm tra - isNude: ${isNude}, percentage: ${percentage}, ngưỡng: ${percentNsfw}`);

        if (isNude && percentage > percentNsfw) {
          console.log(`⚠️ Phát hiện vi phạm! Xóa tin nhắn và cảnh báo...`);
          
          const violations = await loadViolations();
          const userViolation = violations[senderId] || {
            count: 0,
            lastViolation: 0,
          };

          if (Date.now() - userViolation.lastViolation > 3600000) {
            userViolation.count = 0;
          }

          userViolation.count++;
          await saveViolation(senderId, userViolation.count, senderName, threadId);

          if (isWhiteList) {
            await api.deleteMessage(message, false);
            await api.sendMessage(
              {
                msg:
                  `⚠️ ${senderName}!\nUầy bạn ơi, cái này múp quá, tôi phải giấu thôi... (Độ nhạy cảm: ${percentage}%).`,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ ".length)],
                quote: message,
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          } else if (userViolation.count >= 3) {
            await handleNudeContent(api, message, threadId, senderId, senderName, groupSettings);
            await saveViolation(senderId, 0, senderName, threadId);
          } else {
            await api.deleteMessage(message, false);
            await api.sendMessage(
              {
                msg:
                  `⚠️ Cảnh cáo ${senderName}!\n` +
                  `Sếp tao cấm gửi nội dung nhạy cảm!!! (Độ nhạy cảm: ${percentage}%).\n` +
                  `Vi phạm ${userViolation.count}/3 lần. Vi phạm nhiều lần, tao đá khỏi box!`,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
                quote: message,
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          }
          return true;
        } else {
          console.log(`✅ Ảnh an toàn hoặc dưới ngưỡng`);
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra nội dung ảnh:", error);
      }
    }
  }
  return false;
}

async function handleNudeContent(api, message, threadId, senderId, senderName, groupSettings) {
  try {
    console.log(`🚫 Block user ${senderName} (${senderId}) do vi phạm 5 lần`);
    await api.deleteMessage(message, false);
    await api.blockUsers(threadId, [senderId]);
    blockedUsers.add(senderId);

    const groupInfo = await getGroupInfoData(api, threadId);
    const userInfo = await getUserInfoData(api, senderId);

    let imagePath = null;
    if (groupSettings?.[threadId]?.enableBlockImage === true) {
      imagePath = await createBlockSpamImage(
        userInfo,
        groupInfo.name,
        groupInfo.groupType,
        userInfo.gender
      );
    }

    if (imagePath) {
      await api.sendMessage(
        {
          msg: `Thành viên [ ${senderName} ] đã bị chặn do gửi nội dung nhạy cảm 5 lần! 🚫`,
          attachments: [imagePath],
        },
        threadId,
        MessageType.GroupMessage
      );
      try {
        await api.sendMessage(
          {
            msg: `Bạn đã bị chặn do gửi nội dung nhạy cảm 5 lần! 🚫\nVui lòng không lặp lại hành vi này ở nơi khác.`,
            attachments: [imagePath],
          },
          senderId,
          MessageType.DirectMessage
        );
      } catch (error) {
        console.error(`Không thể gửi tin nhắn tới ${senderId}:`, error.message);
      }
      await clearImagePath(imagePath);
    } else {
      await api.sendMessage(
        {
          msg: `Thành viên [ ${senderName} ] đã bị chặn do gửi nội dung nhạy cảm 5 lần! 🚫`,
        },
        threadId,
        MessageType.GroupMessage
      );
    }
    
    setTimeout(() => {
      blockedUsers.delete(senderId);
    }, 300000);
  } catch (error) {
    console.error(`Lỗi khi xử lý nội dung nhạy cảm:`, error);
  }
}

async function showNudeViolationHistory(api, message) {
  try {
    const threadId = message.threadId;
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm.",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    const antiState = getAntiState();
    const violations = antiState.data.violationsNude || {};

    let responseMsg = "📝 Lịch sử vi phạm gửi ảnh nhạy cảm:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const violation = violations[userId];

      messageMentions.push(MessageMention(userId, userName.length, mentionPosition));

      if (!violation) {
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
      } else {
        responseMsg += `${userName}: Vi phạm ${violation.count} lần\n`;
        responseMsg += `Lần vi phạm gần nhất: ${new Date(violation.lastViolation).toLocaleString()}\n\n`;
      }

      mentionPosition = responseMsg.length;
    }

    await api.sendMessage(
      {
        msg: responseMsg.trim(),
        quote: message,
        mentions: messageMentions,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử vi phạm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử vi phạm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

export async function handleAntiNudeCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "list") {
    await showNudeViolationHistory(api, message);
    return true;
  }

  let newStatus;
  if (command === "on") {
    groupSettings[threadId].antiNude = true;
    newStatus = "bật";
  } else if (command === "off") {
    groupSettings[threadId].antiNude = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiNude = !groupSettings[threadId].antiNude;
    newStatus = groupSettings[threadId].antiNude ? "bật" : "tắt";
  }

  const caption = `Chức năng chống nội dung nhạy cảm đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiNude, 300000);

  return true;
}

export async function startNudeViolationCheck() {
  const jobName = "nudeViolationCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }

  schedule.scheduleJob(jobName, "*/5 * * * * *", async () => {
    try {
      const antiState = getAntiState();
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 1000 * 60 * 60 * 24;

      if (antiState.data.violationsNude) {
        const violations = { ...antiState.data.violationsNude };

        for (const userId in violations) {
          const violation = violations[userId];

          if (currentTime - violation.lastViolation > VIOLATION_TIMEOUT) {
            hasChanges = true;
            delete violations[userId];
          }
        }

        if (hasChanges) {
          updateAntiConfig({
            ...antiState.data,
            violationsNude: violations
          });
        }
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm nude:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra vi phạm nude"));
}
