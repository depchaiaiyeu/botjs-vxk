import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "./index.js";

// Hàm đọc danh sách badwords từ file config
async function loadConfig() {
  const antiState = getAntiState();
  return antiState.data.badWords || [];
}

// Hàm kiểm tra từ cấm
async function checkBadWords(content) {
  // Load danh sách từ cấm mỗi khi cần kiểm tra
  const badWords = await loadConfig();
  const normalizedContent = normalizeText(content);
  const words = normalizedContent.split(/\s+/);

  for (const badWord of badWords) {
    const normalizedBadWord = normalizeText(badWord);

    // Kiểm tra từng từ riêng biệt
    for (const word of words) {
      if (word === normalizedBadWord) {
        return {
          found: true,
          word: badWord,
        };
      }
    }

    // Kiểm tra cụm từ trong nội dung
    if (normalizedBadWord.includes(" ")) {
      if (normalizedContent.includes(normalizedBadWord)) {
        return {
          found: true,
          word: badWord,
        };
      }
    }
  }

  return {
    found: false,
    word: null,
  };
}

// Hàm xử lý thêm/xóa từ cấm
async function handleBadWordModification(api, message, action, word) {
  const threadId = message.threadId;

  if (!word) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập từ khóa cần ${action === "add" ? "thêm" : "xóa"}`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const antiState = getAntiState();
  const currentBadWords = [...antiState.data.badWords]; // Tạo bản sao của mảng hiện tại

  const normalizedWord = word.toLowerCase();

  if (action === "add") {
    if (!currentBadWords.map(w => w.toLowerCase()).includes(normalizedWord)) {
      currentBadWords.push(word);
      await updateAntiConfig({
        ...antiState.data,
        badWords: currentBadWords,
      });

      await api.sendMessage(
        {
          msg: `Đã thêm "${word}" vào danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `Từ "${word}" đã có trong danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
  } else if (action === "remove") {
    const index = currentBadWords.map(w => w.toLowerCase()).indexOf(normalizedWord);
    if (index !== -1) {
      currentBadWords.splice(index, 1);
      await updateAntiConfig({
        ...antiState.data,
        badWords: currentBadWords,
      });

      await api.sendMessage(
        {
          msg: `Đã xóa "${word}" khỏi danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `Không tìm thấy "${word}" trong danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
  }
}
// Hàm chuẩn hóa văn bản
function normalizeText(text) {
  return (
    text
      .toLowerCase()
      // .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
      // .replace(/[èéẹẻẽêềếệểễ]/g, "e")
      // .replace(/[ìíịỉĩ]/g, "i")
      // .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
      // .replace(/[ùúụủũưừứựửữ]/g, "u")
      // .replace(/[ỳýỵỷỹ]/g, "y")
      // .replace(/đ/g, "d")
      // .replace(/\s+/g, " ")
      .trim()
  );
}

// Hàm hiển thị danh sách từ cấm
async function showBadWordsList(api, message) {
  const threadId = message.threadId;
  try {
    const wordsList = await loadConfig();

    if (wordsList.length === 0) {
      await api.sendMessage(
        {
          msg: "Hiện tại chưa có từ ngữ nào bị cấm.",
          quote: message,
        },
        threadId,
        message.type
      );
      return;
    }

    const formattedList = wordsList.join(", ");
    await api.sendMessage(
      {
        msg: `📝 Danh sách từ ngữ bị cấm (${wordsList.length} từ):\n[${formattedList}]\n\n💡 Dùng lệnh:\n- !antibadword add [từ] để thêm\n- !antibadword remove [từ] để xóa`,
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc danh sách từ cấm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc danh sách từ cấm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

// Hàm xử lý lệnh !antibadword
export async function handleAntiBadWordCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "list") {
    await showBadWordsList(api, message);
    return true;
  }

  if (command === "show") {
    await showViolationHistory(api, message, threadId);
    return true;
  }

  if (command === "add" || command === "remove") {
    const word = args.slice(2).join(" ");
    await handleBadWordModification(api, message, command, word);
    return true;
  }

  if (command === "on") {
    groupSettings[threadId].filterBadWords = true;
  } else if (command === "off") {
    groupSettings[threadId].filterBadWords = false;
  } else {
    // Xử lý trường hợp người dùng nhập lệnh mà không có tham số command
    groupSettings[threadId].filterBadWords =
      !groupSettings[threadId].filterBadWords;
  }

  const newStatus = groupSettings[threadId].filterBadWords ? "bật" : "tắt";
  const caption = `Chức năng lọc từ khóa thô tục đã được ${newStatus}!`;
  await sendMessageStateQuote(
    api,
    message,
    caption,
    groupSettings[threadId].filterBadWords,
    300000
  );
  return true;
}

// Hàm lưu vi phạm
async function saveViolation(threadId, userId, userName, badWord) {
  const antiState = getAntiState();
  const violations = antiState.data.violations || {};

  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      words: [],
      name: userName,
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].words.push({
    word: badWord,
    time: Date.now(),
  });

  if (violations[threadId][userId].words.length > 3) {
    violations[threadId][userId].words = violations[threadId][userId].words.slice(
      -3
    );
  }

  await updateAntiConfig({
    ...antiState.data,
    violations,
  });

  return violations[threadId][userId];
}

// Hàm xử lý tin nhắn chứa từ cấm
export async function antiBadWord(
  api,
  message,
  groupSettings,
  isAdminBox,
  botIsAdminBox,
  isSelf
) {
  if (isSelf) return false;
  let content = message.data.content;
  content = content.title ? content.title : content;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const isPlainText = typeof content === "string";

  if (isPlainText && groupSettings[threadId]?.filterBadWords) {
    if (
      !botIsAdminBox ||
      isAdminBox ||
      isInWhiteList(groupSettings, threadId, senderId)
    )
      return false;

    const normalizedContent = content.toLowerCase();
    const checkBadWordsResult = await checkBadWords(normalizedContent);

    if (checkBadWordsResult.found) {
      try {
        await api.deleteMessage(message, false).catch(console.error);
        const senderName = message.data.dName;

        const violation = await saveViolation(
          threadId,
          senderId,
          senderName,
          checkBadWordsResult.word
        );

        let warningMsg = `${senderName} > Tin nhắn bị xóa vì chứa từ ngữ bị cấm: "${checkBadWordsResult.word}"\n`;
        warningMsg += `Cảnh cáo lần ${violation.count}/3`;

        if (violation.count >= 3) {
          // Thêm kiểm tra groupSettings[threadId]
          if (!groupSettings[threadId]) {
            groupSettings[threadId] = {};
          }
          await extendMuteDuration(
            threadId,
            senderId,
            senderName,
            groupSettings,
            900
          );

          const antiState = getAntiState();
          const violations = { ...antiState.data.violations };

          if (violations[threadId]?.[senderId]) {
            violations[threadId][senderId].count = 0;

            await updateAntiConfig({
              ...antiState.data,
              violations,
            });
          }

          warningMsg += "\n⚠️ Vi phạm 3 lần, bạn bị cấm chat trong 15 phút!";
        }

        await api.sendMessage(
          {
            msg: warningMsg,
            quote: message,
            mentions: [MessageMention(senderId, senderName.length, 0)],
            ttl: 30000,
          },
          threadId,
          message.type
        );
        return true;
      } catch (error) {
        console.error("Có lỗi xảy ra khi anti badword:", error.message);
      }
    }
  }
  return false;
}
export async function showViolationHistory(api, message, threadId) {
  try {
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
    const violations = antiState.data.violations || {};

    let responseMsg = "📝 Lịch sử vi phạm:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName =
        "@" + message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = violations[threadId]?.[userId];

      if (userViolations && userViolations.words.length > 0) {
        // Thêm mention vào danh sách
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );

        const countViolations = userViolations.count;
        let recentViolations = "Những vi phạm gần nhất:\n";
        recentViolations += userViolations.words
          .slice(-3)
          .map(
            (v, i) =>
              `  ${i + 1}. "${v.word}" - ${new Date(v.time).toLocaleString()}`
          )
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần vi phạm: ${countViolations}\n`;
        responseMsg += `${recentViolations}\n`;

        mentionPosition = responseMsg.length;
      } else {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
        mentionPosition = responseMsg.length;
      }
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
export async function startBadWordViolationCheck() {
  const jobName = "violationCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }
  schedule.scheduleJob(jobName, "*/5 * * * * *", async () => {
    try {
      const antiState = getAntiState();
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 30 * 60 * 1000; // 30 phút
      const violations = { ...antiState.data.violations };
      for (const threadId in violations) {
        for (const userId in violations[threadId]) {
          const userViolations = violations[threadId][userId];
          const recentViolations = userViolations.words.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });
          if (recentViolations.length < userViolations.words.length) {
            hasChanges = true;
            userViolations.words = recentViolations;
            userViolations.count = recentViolations.length;
            if (recentViolations.length === 0) {
              delete violations[threadId][userId];
            }
          }
        }
        if (Object.keys(violations[threadId]).length === 0) {
          delete violations[threadId];
        }
      }
      if (hasChanges) {
        await updateAntiConfig({
          ...antiState.data,
          violations,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm:", error);
    }
  });

  console.log(
    chalk.yellow("Đã khởi động schedule kiểm tra vi phạm từ khóa thô tục")
  );
}