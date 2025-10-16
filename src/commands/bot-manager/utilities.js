import { GroupMessage, Message, MessageMention } from "../../api-zalo/index.js";
import { sendReactionWaitingCountdown } from "../manager-command/check-countdown.js";

import { getCommandConfig, isAdmin } from "../../index.js";
import { sendMessageFailed, sendMessageFromSQL, sendMessageStateQuote } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { writeCommandConfig } from "../../utils/io-json.js";
import { permissionLevels } from "../command.js";
import { getPermissionCommandName } from "../manager-command/set-command.js";
import { getBotId } from "../../index.js";
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fetch from "node-fetch";
import { setTimeout as delay } from 'timers/promises';
import * as cheerio from "cheerio";
import qs from "qs";


let stop = false;

const baseDataPath = path.resolve(process.cwd(), "src", "service-hahuyhoang", "chat-zalo", "chat-special", "send-video", "data-api");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeTodo = false;

export function stopTodo() {
  activeTodo = false;
}

export async function handleGetUID(api, message) {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    const threadId = message.threadId;
    let mentions = message.data?.mentions || [];

    if (mentions.length === 0) {
      await api.sendMessage(
        {
          msg: `(@${senderName})\nUID của bạn là: ${senderId}\nUID của Group hiện tại là: ${threadId}`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 360000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const targetUid = mentions[0].uid;

    await api.sendMessage(
      {
        msg: `(@${senderName})\nUID của người được bạn mentions là: ${targetUid}\nUID của Group hiện tại là: ${threadId}`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
        ttl: 360000,
      },
      message.threadId,
      message.type
    );

  } catch (error) {
    console.error("❌ Lỗi khi lấy UID:", error);
    await sendMessageFailed(api, message, `Lỗi khi lấy UID: ${error.message}`);
  }
}

export async function handleEval(api, message) {
  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    const threadId = message.threadId;
    const codeToEval = content.replace(new RegExp(`^${prefix}eval\\s*`, 'i'), '').trim();
    if (!codeToEval) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Vui lòng nhập code cần thực thi!`
        },
        false,
        30000
      );
      return;
    }
    const evalContext = {
      api,
      message,
      senderName,
      senderId,
      threadId
    };
    let result;
    try {
      result = await (async function() {
        const contextKeys = Object.keys(evalContext);
        const contextValues = Object.values(evalContext);
        const AsyncFunction = async function(){}.constructor;
        const fn = new AsyncFunction(...contextKeys, codeToEval);
        return await fn(...contextValues);
      })();
    } catch (error) {
      result = await (async function() {
        const contextKeys = Object.keys(evalContext);
        const contextValues = Object.values(evalContext);
        const AsyncFunction = async function(){}.constructor;
        const fn = new AsyncFunction(...contextKeys, `return (${codeToEval})`);
        return await fn(...contextValues);
      })();
    }
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `✅ Thực thi thành công!\n${result !== undefined ? `Kết quả: ${JSON.stringify(result, null, 2)}` : ''}`
      },
      false,
      60000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `❌ Lỗi:\n${error.message}`
      },
      false,
      60000
    );
  }
}

export async function handleCallGroupCommand(api, message) {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    let mentions = message.data?.mentions || [];
    let times = 1;
    if (message.data?.body) {
      const match = message.data.body.match(/callgroup\s+(?:<@mention>)?\s*(\d+)/i);
      if (match && match[1]) {
        times = Math.max(1, parseInt(match[1]));
      }
    }
    if (mentions.length === 0 && message.data?.reply) {
      mentions.push({
        uid: message.data.reply.uid,
        dName: message.data.reply.dName || "Người dùng"
      });
    }
    if (mentions.length === 0) {
      await api.sendMessage(
        {
          msg: `(@${senderName}) Dùng \`callgroup @mention <số lần>\` hoặc trả lời tin nhắn để gọi nhóm!`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 360000,
        },
        message.threadId,
        message.type
      );
      return;
    }
    const successfulMentions = [];
    await Promise.all(
      mentions.map(async mention => {
        try {
          for (let i = 0; i < times; i++) {
            await api.callGroup(message.threadId, mention.uid);
          }
          successfulMentions.push({
            uid: mention.uid,
            dName: mention.dName || "Người dùng"
          });
        } catch {}
      })
    );
    if (successfulMentions.length === 0) {
      await api.sendMessage(
        {
          msg: `(@${senderName}) ❌ Không thể gọi nhóm với bất kỳ ai.`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 360000,
        },
        message.threadId,
        message.type
      );
      return;
    }
    let mentionText = `(@${senderName}), \n📞 Đã gọi nhóm ${times} lần đến: `;
    let mentionPos = mentionText.length;
    const mentionData = [{ uid: senderId, pos: 0, len: senderName.length + 3 }];
    successfulMentions.forEach(mention => {
      const displayName = mention.dName || "Người dùng";
      mentionText += `(@${displayName}) (${times} lần)\n✅✅`;
      mentionData.push({ uid: mention.uid, pos: mentionPos, len: displayName.length + 3 });
      mentionPos += displayName.length + 4 + (` (${times} lần)`).length;
    });
    await api.sendMessage(
      {
        msg: mentionText.trim(),
        mentions: mentionData,
        ttl: 360000,
      },
      message.threadId,
      message.type
    );
  } catch (error) {
    console.error("❌ Lỗi khi gọi nhóm:", error);
    throw error;
  }
}

export async function handleChangeGroupLink(api, message) {
  try {
    const threadId = message.threadId;
    await api.changeGroupLink(threadId);
  } catch (error) {
    const result = {
      success: false,
      message: `Lỗi khi đổi link nhóm: ${error.message}`,
    };
    await sendMessageFailed(api, message, result);
  }
}

export async function handleUndoMessage(api, message) {
  try {
    await api.undoMessage(message);
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xử lý lệnh undo: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendToDo(api, message) {
  const content = removeMention(message);

  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const parts = content.split("_");

  if (parts.length == 2 && parts[1].toLowerCase() === "stop") {
    if (activeTodo) {
      stopTodo();
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: "Đã dừng tất cả các todo đang chạy!",
        },
        false,
        30000
      );
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Không có todo nào đang chạy!",
        },
        false,
        30000
      );
    }
    return;
  }

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Cú pháp không đúng. Vui lòng sử dụng:\n` +
          `${prefix}todo_[Nội dung công việc]_[Số lần] @user\n` +
          `hoặc: ${prefix}todo_[Nội dung công việc]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let todoContent = parts[1].trim();

    if (todoContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Có Nội Dung Công Việc!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdmin(senderId) && repeatCount > 3) {
      repeatCount = 3;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Tìm Thấy Mục Tiêu Để Giao Việc!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoData(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.name}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã giao việc "${todoContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    activeTodo = true;
    for (let i = 0; i < repeatCount; i++) {
      if (!activeTodo) {
        break;
      }
      await api.sendTodo(message, todoContent, userIds, -1, todoContent);
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi giao việc: ${error.message}`,
      },
      false,
      30000
    );
  }
}

/**
 * Tính độ tương đồng giữa 2 chuỗi sử dụng thuật toán Levenshtein Distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1)
    .fill()
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

/**
 * Tìm các lệnh tương tự dựa trên độ tương đồng của chuỗi
 */
function findSimilarCommands(command, availableCommands, threshold = 0.6) {
  const similarCommands = [];
  const commandLower = command.toLowerCase();

  // Tách command thành các ký tự riêng lẻ
  const commandChars = commandLower.split("");

  // Map các viết tắt phổ biến
  const commonShortcuts = {
    dy: "daily",
    dk: "dangky",
    nt: "nongtrai",
    tx: "taixiu",
    kbb: "keobuabao",
    tt: "thongtin",
    bg: "background",
  };

  for (const cmd of availableCommands) {
    const cmdNameLower = cmd.name.toLowerCase();

    // Kiểm tra các trường hợp:
    const isStartsWith = cmdNameLower.startsWith(commandLower);

    // Kiểm tra viết tắt phổ biến
    const isCommonShortcut = commonShortcuts[commandLower] === cmdNameLower;

    // Kiểm tra xem các ký tự của command có xuất hiện theo thứ tự trong tên lệnh không
    let matchesSequence = true;
    let lastIndex = -1;
    for (const char of commandChars) {
      const index = cmdNameLower.indexOf(char, lastIndex + 1);
      if (index === -1) {
        matchesSequence = false;
        break;
      }
      lastIndex = index;
    }

    // Tính độ tương đồng bằng Levenshtein
    const distance = levenshteinDistance(commandLower, cmdNameLower);
    const similarity = 1 - distance / Math.max(command.length, cmd.name.length);

    // Thêm vào danh sách nếu thỏa mãn một trong các điều kiện
    if (isStartsWith || isCommonShortcut || matchesSequence || similarity >= threshold) {
      similarCommands.push({
        command: cmd,
        similarity: isStartsWith ? 1 : isCommonShortcut ? 0.95 : matchesSequence ? 0.9 : similarity,
      });
    }
  }

  return similarCommands
    .sort((a, b) => {
      // Đầu tiên sắp xếp theo quyền hạn
      const permissionDiff = permissionLevels[a.permission] - permissionLevels[b.permission];
      if (permissionDiff !== 0) return permissionDiff;

      // Nếu cùng quyền hạn thì sắp xếp theo độ tương đồng (cao xuống thấp)
      return b.similarity - a.similarity;
    })
    .slice(0, 5)
    .map((item) => item.command);
}

/**
 * Kiểm tra và gợi ý lệnh khi không tìm thấy command
 */
export async function checkNotFindCommand(api, message, command, availableCommands) {
  const prefix = getGlobalPrefix();
  if (prefix === "") return;

  if (!command || command.trim() === "") {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Nếu Bạn Thắc Mắc Tôi Có Những Lệnh Gì, Hãy...\n` +
          `${prefix}help - Xem các lệnh cơ bản\n` +
          `${prefix}game - Xem các lệnh game\n` +
          `${prefix}command - Xem toàn bộ danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
    return;
  }

  const similarCommands = findSimilarCommands(command, availableCommands);

  if (similarCommands.length > 0) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}"\n` +
          `Có phải bạn muốn dùng:\n` +
          similarCommands
            .map((cmd) => `${prefix}${cmd.name} [${getPermissionCommandName(cmd)}]`)
            .join("\n"),
      },
      false,
      30000
    );
  } else {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}". Vui lòng sử dụng:\n` +
          `${prefix}help - Xem hướng dẫn sử dụng\n` +
          `${prefix}game - Xem hướng dẫn chơi game\n` +
          `${prefix}command - Xem danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
  }
}

/**
 * Xử lý thêm alias cho command
 */
export async function handleAliasCommand(api, message, commandParts) {
  const prefix = getGlobalPrefix();
  const subCommand = commandParts[1]?.toLowerCase();
  const cmdName = commandParts[2]?.toLowerCase();
  const aliasName = commandParts[3]?.toLowerCase();

  if (!subCommand) {
    await handleListAlias(api, message);
    return;
  }

  switch (subCommand) {
    case "add":
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp không đúng. Vui lòng sử dụng:\n${prefix}alias add [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleAddAlias(api, message, cmdName, aliasName);
      break;

    case "remove":
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp không đúng. Vui lòng sử dụng:\n${prefix}alias remove [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleRemoveAlias(api, message, cmdName, aliasName);
      break;

    case "list":
      await handleListAlias(api, message, cmdName);
      break;

    default:
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message:
            `Cú pháp không đúng. Sử dụng:\n` +
            `${prefix}alias add [tên lệnh] [tên alias] - Thêm alias\n` +
            `${prefix}alias remove [tên lệnh] [tên alias] - Xóa alias\n` +
            `${prefix}alias list [tên lệnh] - Xem danh sách alias\n` +
            `${prefix}alias - Xem tất cả alias`,
        },
        false,
        300000
      );
      break;
  }
}

export async function handleAddAlias(api, message, commandName, aliasName) {
  try {
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để thêm alias`,
        },
        false,
        300000
      );
      return;
    }

    if (!command.alias) {
      command.alias = [];
    }

    if (command.alias.includes(aliasName)) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Alias "${aliasName}" đã tồn tại cho lệnh "${commandName}"`,
        },
        false,
        300000
      );
      return;
    }

    const isAliasExist = commandConfig.commands.some((cmd) => cmd.name === aliasName || (cmd.alias && cmd.alias.includes(aliasName)));

    if (isAliasExist) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không thể thêm alias "${aliasName}" vì đã tồn tại như một lệnh hoặc alias khác`,
        },
        false,
        300000
      );
      return;
    }

    command.alias.push(aliasName);
    writeCommandConfig(commandConfig);

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã thêm alias "${aliasName}" cho lệnh "${commandName}"`,
      },
      false,
      300000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi thêm alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý xóa alias của command
 */
export async function handleRemoveAlias(api, message, commandName, aliasName) {
  try {
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để xóa alias`,
        },
        false,
        300000
      );
      return;
    }

    if (!command.alias || !command.alias.includes(aliasName)) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy alias "${aliasName}" trong lệnh "${commandName}"`,
        },
        false,
        300000
      );
      return;
    }

    command.alias = command.alias.filter((a) => a !== aliasName);
    writeCommandConfig(commandConfig);

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã xóa alias "${aliasName}" khỏi lệnh "${commandName}"`,
      },
      false,
      300000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xóa alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý hiển thị danh sách alias của command
 */
export async function handleListAlias(api, message, commandName) {
  try {
    const commandConfig = getCommandConfig();

    if (commandName) {
      const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

      if (!command) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      const aliases = command.alias || [];
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message:
            aliases.length > 0
              ? `Danh sách alias của lệnh "${commandName}":\n${aliases.join(", ")}`
              : `Lệnh "${commandName}" không có alias nào`,
        },
        false,
        300000
      );
    } else {
      const aliasInfo = commandConfig.commands
        .filter((cmd) => cmd.alias && cmd.alias.length > 0)
        .map((cmd) => `${cmd.name}: ${cmd.alias.join(", ")}`)
        .join("\n");

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: aliasInfo.length > 0 ? `Danh sách alias của các lệnh:\n${aliasInfo}` : "Không có alias nào được cấu hình",
        },
        false,
        300000
      );
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi hiển thị alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

export async function handleSendMessagePrivate(api, message) {
  const content = removeMention(message);
  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const parts = content.split("_");

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Cú pháp không đúng. Vui lòng sử dụng:\n` +
          `${prefix}sendp_[Nội dung tin nhắn]_[Số lần] @user\n` +
          `hoặc: ${prefix}sendp_[Nội dung tin nhắn]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let smsContent = parts[1].trim();

    if (smsContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không có nội dung tin nhắn!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdmin(senderId) && repeatCount > 999) {
      repeatCount = 999;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy người nhận!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoData(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.name}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã bắt đầu send tin nhắn riêng "${smsContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    for (const userId of userIds) {
      for (let i = 0; i < repeatCount; i++) {
        try {
          await api.sendSMS(smsContent, userId);
        } catch (error) {
          console.error(`Lỗi khi gửi tin nhắn riêng cho ${userId}:`, error);
          continue;
        }
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã hoàn thành gửi tin nhắn riêng cho ${targetText}`,
      },
      false,
      30000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi gửi tin nhắn riêng: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendTaskCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const status = content.split(" ")[1]?.toLowerCase();
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  let newStatus;
  if (status === "on") {
    groupSettings[threadId].sendTask = true;
    newStatus = "bật";
  } else if (status === "off") {
    groupSettings[threadId].sendTask = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].sendTask = !groupSettings[threadId].sendTask;
    newStatus = groupSettings[threadId].sendTask ? "bật" : "tắt";
  }

  const caption = `Đã ${newStatus} chức năng gửi nội dung tự động sau mỗi giờ vào nhóm này!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].sendTask, 300000);

  return true;
}

export async function handleGetLinkInQuote(api, message) {
  const quote = message.data.quote;
  if (!quote || !quote.attach) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Không tìm thấy link trong tin nhắn được reply!`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const attachData = JSON.parse(quote.attach);
    
    if (!attachData.href) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy link trong tin nhắn được reply!`,
        },
        false,
        30000
      );
      return;
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Link: ${attachData.href}`,
      },
      false,
      180000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xử lý link: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSetAvatarFromReply(api, message, groupInfo) {
  const groupId = groupInfo.groupId;
  if (!groupId) {
    await sendMessageStateQuote(api, message, "Lỗi: Không tìm thấy groupId.", false, 30000);
    return;
  }

  const quote = message.data?.quote;
  if (!quote || !quote.attach) {
    await sendMessageStateQuote(api, message, "Vui lòng reply vào một tin nhắn có ảnh để đặt làm ảnh đại diện!", false, 30000);
    return;
  }

  const attachData = JSON.parse(quote.attach);
  const imageUrl = attachData.params ? JSON.parse(attachData.params)?.hd || attachData.href : attachData.href;
  if (!imageUrl) {
    await sendMessageStateQuote(api, message, "Không tìm thấy URL ảnh hợp lệ trong tin nhắn được reply!", false, 30000);
    return;
  }

  const tempDir = path.resolve(__dirname, 'cache');
  await fs.mkdir(tempDir, { recursive: true });

  const avatarPath = path.resolve(tempDir, `avatar_${groupId}_${Date.now()}.jpg`);

  try {
    await downloadFile(imageUrl, avatarPath);
    await api.changeGroupAvatar(groupId, avatarPath);
    await sendMessageStateQuote(api, message, "Ảnh đại diện của nhóm đã được thay đổi thành công!", true, 30000);
  } catch (error) {
    await sendMessageStateQuote(api, message, `Lỗi khi đổi ảnh đại diện nhóm: ${error.message}`, false, 30000);
  } finally {
    if (await fileExists(avatarPath)) await fs.unlink(avatarPath);
  }
}

async function downloadFile(url, filePath) {
  const writer = (await import('fs')).createWriteStream(filePath);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function handleRunDDoSCommand(api, message, commandParts) {
  if (!commandParts || commandParts.length < 3) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: `Sai cú pháp!\nVí dụ lệnh: ddos target time \n Max 60 giây` },
      false,
      30000
    );
    return;
  }

  const target = commandParts[1];
  const time = parseInt(commandParts[2], 10);

  if (!target.startsWith("http") || isNaN(time) || time <= 0) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: `Tham số không hợp lệ! URL và thời gian phải chính xác 60s Max.` },
      false,
      30000
    );
    return;
  }

  if (time > 60) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: `Tối đa là 60 giây` },
      false,
      30000
    );
    return;
  }

  const workingDir = path.resolve("C:\\Users\\Administrator\\Desktop\\Ddos");
  const scriptPath = "nph.js";
  const defaultThreads = 32;
  const defaultRateLimit = 10;
  const proxyFile = "proxy.txt";

  try {
    spawn(
      "cmd.exe",
      [
        "/c",
        "start",
        "cmd.exe",
        "/c",
        `node ${scriptPath} ${target} ${time} ${defaultThreads} ${defaultRateLimit} ${proxyFile} && timeout /t ${time} && exit`
      ],
      { cwd: workingDir }
    );

    const now = new Date();
    const formattedTime = now.toLocaleTimeString("vi-VN", { hour12: false });
    const formattedDate = now.toLocaleDateString("vi-VN");
    const checkHostLink = `https://check-host.net/check-http?host=${encodeURIComponent(target)}`;
    const responseMessage = `
🌐 Host: ${target}
🔌 Port: 443
⏰ Time: ${time} giây
🕒 Thời gian: ${formattedTime}
/-li : ${checkHostLink}
    `;

    await sendMessageFromSQL(api, message, { success: true, message: responseMessage }, true, 300000);
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: `Lỗi khi chạy lệnh: ${error.message}` },
      false,
      30000
    );
  }
}

export async function handleUploadFromReply(api, message, aliasCommand) {
  const quote = message.data?.quote;

  if (!quote || !quote.attach) {
    await sendMessageStateQuote(api, message, "Sếp Reply vào cái Video đó đi !", false, 30000);
    return;
  }

  const prefixCommand = getGlobalPrefix();
  let content = removeMention(message);
  if (aliasCommand) {
    content = content.replace(`${prefixCommand}${aliasCommand}`, "").trim();
  }

  const mentionRegex = /^@\w+\s+/;
  const contentWithoutMention = content.replace(mentionRegex, "").trim();
  const parts = contentWithoutMention.split(/\s+/);
  const param = parts.length >= 1 ? parts[parts.length - 1] : null;

  const fileName = param ? `${param}.txt` : "default.txt";
  const filePath = path.join(baseDataPath, fileName);

  try {
    const attachData = JSON.parse(quote.attach);
    const fileUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl;

    if (!fileUrl) {
      await sendMessageStateQuote(api, message, "Không tìm thấy URL hợp lệ", false, 30000);
      return;
    }

    // Upload lên Catbox
    const payload = {
      reqtype: "urlupload",
      url: fileUrl,
    };

    let response;
    try {
      response = await axios.post(
        "https://catbox.moe/user/api.php",
        qs.stringify(payload),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );
    } catch (error) {
      console.error("Lỗi khi gọi API upload:", error.message);
      await sendMessageStateQuote(api, message, `Upload thất bại do lỗi kết nối: ${error.message}`, false, 30000);
      return;
    }

    const resultUrl = response.data?.trim();
    if (!resultUrl || !resultUrl.startsWith("https://files.catbox.moe/")) {
      await sendMessageStateQuote(api, message, `Upload thất bại.`, false, 30000);
      return;
    }

    try {
      await fs.mkdir(baseDataPath, { recursive: true });
      await fs.appendFile(filePath, `${resultUrl}\n`, "utf8");
    } catch (error) {
      console.error("Lỗi khi ghi vào file:", error.message);
      await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi lưu link vào tệp ${fileName}.`, false, 30000);
      return;
    }

    await sendMessageStateQuote(api, message, `Xong rồi sếp ơi em lưu vào: ${fileName}`, true, 30000);
  } catch (error) {
    console.error("Lỗi khi xử lý upload:", error.message);
    await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi xử lý: ${error.message}`, false, 30000);
  }
}

export async function handle4KImage(api, message) {
  const threadId = message.threadId;
  const quote = message.data?.quote;
  const senderName = message.data?.dName || "Người dùng";
  const senderId = message.data?.uidFrom;

  if (!quote || !quote.attach) {
    await sendMessageStateQuote(api, message, "Vui lòng reply vào một tin nhắn chứa ảnh hợp lệ!", false, 30000);
    return;
  }

  try {
    const attachData = JSON.parse(quote.attach);
    const fileUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl;

    if (!fileUrl) {
      throw new Error("Không tìm thấy URL hợp lệ từ ảnh được reply!");
    }

    const enhanceApiUrl = `https://hungdev.id.vn/ai/4k?url=${encodeURIComponent(fileUrl)}&apikey=0c590fbeeb556d3cd29f419181c4a2`;

    const response = await axios.get(enhanceApiUrl);
    const result = response.data;

    if (!result.success || !result.data) {
      throw new Error(result.message || "Không rõ lý do.");
    }

    const enhancedImageUrl = result.data;

    const tempDir = path.resolve(__dirname, "cache");
    await fs.mkdir(tempDir, { recursive: true });
    const enhancedImagePath = path.resolve(tempDir, `enhanced_image_${Date.now()}.png`);

    await downloadFile(enhancedImageUrl, enhancedImagePath);

    await api.sendMessage(
      {
        msg: `@${senderName}\nẢnh 4K của Anh đây`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
        attachments: [enhancedImagePath],
        ttl: 5000000,
      },
      threadId,
      message.type
    );

    if (await fileExists(enhancedImagePath)) {
      await fs.unlink(enhancedImagePath);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý làm nét ảnh:", error.message);
    await sendMessageStateQuote(api, message, `Cái lìn này Không làm nét được roài mài ơi`, false, 30000);
  }
}
export async function spamMessagesInGroup(api, message, aliasCommand) {
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, '').trim();
  const lowerContent = content.toLowerCase();
  const cacheFilePath = path.resolve(__dirname, 'cache', 'spam.txt');

  try {
    if (lowerContent.startsWith('start')) {
      const delayArg = content.slice(5).trim();
      let delayTime = 300;
      if (delayArg) {
        const match = delayArg.match(/^(\d+)(ms|s)$/);
        if (match) {
          const value = parseInt(match[1]);
          if (match[2] === 'ms') {
            delayTime = value;
          } else if (match[2] === 's') {
            delayTime = value * 1000;
          }
        }
      }
      const spamContent = await fs.readFile(cacheFilePath, 'utf8');
      if (stop) {
        stop = false;
        return;
      }
      stop = true;
      while (stop) {
        const response = await api.sendMessage({ msg: spamContent, ttl: 20 }, threadId, message.type);
        console.log('Gửi spam:', response);
        await delay(delayTime);
      }
      return;
    }
    if (lowerContent === 'view') {
      try {
        const currentContent = await fs.readFile(cacheFilePath, 'utf8');
        const preview = currentContent || '(File rỗng)';
        const response = await api.sendMessage({ msg: `Nội dung spam hiện tại:\n\n${preview}`, ttl: 100000 }, threadId, message.type);
      } catch (e) {
        const response = await api.sendMessage({ msg: 'Không thể đọc file spam.', ttl: 100000 }, threadId, message.type);
      }
      return;
    }
    if (lowerContent.startsWith('add')) {
      const newLine = content.slice(4).trim();
      await fs.appendFile(cacheFilePath, `\n${newLine}`);
      const response = await api.sendMessage({ msg: 'Đã thêm nội dung spam!', ttl: 100000 }, threadId, message.type);
      return;
    }
    if (lowerContent.startsWith('set')) {
      const newContent = content.slice(4).trim();
      await fs.writeFile(cacheFilePath, newContent);
      const response = await api.sendMessage({ msg: 'Đã cập nhật nội dung spam!', ttl: 100000 }, threadId, message.type);
      return;
    }
    if (!content) {
      await api.sendMessage({
        msg: `Lệnh không hợp lệ. Bạn có thể dùng:\n- ${prefix}${aliasCommand} view\n- ${prefix}${aliasCommand} set: nội dung\n- ${prefix}${aliasCommand} add: nội dung\n- ${prefix}${aliasCommand} start <delay: ms hoặc s>`,
        ttl: 100000
      }, threadId, message.type);
      return;
    }
  } catch (error) {
    console.error('Lỗi khi xử lý spam:', error.message);
    if (error.code === 'ENOENT') {
      const response = await api.sendMessage({ msg: 'Không tìm thấy tệp cấu hình nội dung spam!' }, threadId, message.type);
      console.log('Lỗi ENOENT:', response);
    } else {
      const response = await api.sendMessage({ msg: `Lỗi: ${error.message}` }, threadId, message.type);
      console.log('Lỗi khác:', response);
    }
  }
}

export async function testMediaCommand(api, message) {
  const { threadId, data, type } = message;
  const body = data?.content;
  const args = body.split(" ");
  const contentMatch = body.match(/<([^>]+)>/);
  const textArg = contentMatch ? contentMatch[1] : null;
  const countArg = args[args.length - 1];
  const count = parseInt(countArg, 10);

  if (!textArg || !Number.isInteger(count) || count <= 0) {
    await api.sendMessage(
      { msg: "Err!?" },
      threadId,
      type
    );
    return;
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    for (let i = 0; i < count; i++) {
      await api.sendMessage(
        { msg: textArg, ttl: 100 },
        threadId,
        type
      );
      await delay(1000); // delay 1 giây
    }
  } catch (error) {
    await api.sendMessage(
      { msg: `Err: ${error.message}` },
      threadId,
      type
    );
  }
}


export async function handleGetGroupMembers(api, message, hiddenChar = " ") {
  try {
      const threadId = message.threadId;
      const content = message.data?.content ? message.data.content.trim() : "";
      const prefix = getGlobalPrefix();
      
      if (!content.startsWith(prefix + "tag")) {
          return;
      }

      const customMessage = content.replace(prefix + "tag", "").trim();
      if (!customMessage) {
          return;
      }

      const groupInfo = await api.getGroupInfo(threadId);

      if (!groupInfo || !groupInfo.gridInfoMap || !groupInfo.gridInfoMap[threadId] || 
          !groupInfo.gridInfoMap[threadId].memVerList || 
          !Array.isArray(groupInfo.gridInfoMap[threadId].memVerList)) {
          throw new Error("❌ Không tìm thấy danh sách ID thành viên trong nhóm.");
      }

      const memberIds = groupInfo.gridInfoMap[threadId].memVerList.map(id => id.split("_")[0]);

   //   console.log(📌 Tổng số ID thành viên: ${memberIds.length});

      let mentionPos = customMessage.length;
      const customHiddenText = hiddenChar.repeat(memberIds.length);

      const mentions = memberIds.map(id => {
          const mention = {
              uid: id,
              pos: mentionPos,
              len: 1
          };
          mentionPos += 1;
          return mention;
      });

      await api.sendMessage(
          {
              msg: customMessage + customHiddenText,
              mentions: mentions
          },
          threadId,
          message.type
      );

      return memberIds;
  } catch (error) {
      console.error("❌ Lỗi khi gửi tin nhắn tag:", error);
      throw error;
  }
}
const sentNumbers = {};
const queue = {};

export async function handleRunPythonCommand(api, message) {
  const content = message.data?.content?.trim() || "";
  const prefix = getGlobalPrefix();
  const senderName = message.data?.dName || "Người dùng";
  const senderId = message.data?.uidFrom;
  const threadId = message.threadId;

  if (!content.startsWith(`${prefix}sms`)) {
    await api.sendMessage(
      {
        msg: `(@${senderName})\nVui lòng nhập đúng cú pháp: ${prefix}sms <số điện thoại>`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
      },
      threadId,
      message.type
    );
    return;
  }

  const commandParts = content.split(" ").filter(Boolean);
  if (commandParts.length < 2) {
    await api.sendMessage(
      {
        msg: `(@${senderName})\nSai cú pháp! Ví dụ: ${prefix}sms 0987654321`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
        ttl: 5000000
      },
      threadId,
      message.type
    );
    return;
  }

  const phoneNumber = commandParts[1];
  const count = 20;

  try {
    if (!sentNumbers[phoneNumber]) {
      sentNumbers[phoneNumber] = true;
      for (let i = 1; i <= 10; i++) {
        const scriptPath = path.resolve(__dirname, "data", `${i}.py`);
        spawn("python", [scriptPath, phoneNumber, count], { stdio: "inherit" });
      }
      setTimeout(() => {
        delete sentNumbers[phoneNumber]; 
        if (queue[phoneNumber] && queue[phoneNumber].length > 0) {
          const nextCommand = queue[phoneNumber].shift();
          handleRunPythonCommand(api, nextCommand);
        }
      }, 1000);

      await api.sendMessage(
        {
          msg: `(@${senderName})\n📡 SMS Gửi Thành Công!\n📞 Số Điện Thoại: ${phoneNumber}\n📩 Số Lần Gửi: ${count} lần\n✅ Trạng Thái: Thành công`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 5000000
        },
        threadId,
        message.type
      );
    } else {
      if (!queue[phoneNumber]) {
        queue[phoneNumber] = [];
      }
      queue[phoneNumber].push(message);

      await api.sendMessage(
        {
          msg: `(@${senderName})\nSố điện thoại ${phoneNumber} hiện đang được spam. Vui lòng đợi cho đến khi hoàn tất.`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 5000000
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error(`❌ Lỗi khi gửi SMS: ${error.message}`);
    await api.sendMessage(
      {
        msg: `(@${senderName})\n❌ Lỗi khi gửi SMS: ${error.message}`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
      },
      threadId,
      message.type
    );
  }
}
export async function handleBlockedMembers(api, message) {
  const threadId = message.threadId;
  const senderName = message.data?.dName || "Người dùng";
  const senderId = message.data?.uidFrom;
  try {
    const response = await api.getBlockedGroupMembers(threadId);
  
    console.log("[ZALO DEBUG] getBlockedGroupMembers response:", JSON.stringify(response, null, 2));
  
    const blockedMembers = response?.blocked_members || [];
    // 👉 Log thêm số lượng người bị chặn
    console.log(`[ZALO DEBUG] Tổng số người bị chặn: ${blockedMembers.length}`);
    if (blockedMembers.length === 0) {
      await api.sendMessage(
        {
          msg: `@${senderName}\nKhông có thành viên nào bị chặn trong nhóm này.`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
          ttl: 1000000
        },
        threadId,
        message.type
      );
      return;
    }

    let responseMsg = `@${senderName}\nDanh sách thành viên bị chặn:\n`;
    blockedMembers.forEach((member, index) => {
      responseMsg += `${index + 1}. ${member.dName}\n`;
    });

    await api.sendMessage(
      {
        msg: responseMsg,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
        ttl: 1000000
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi lấy danh sách thành viên bị chặn:", error.message);
    await api.sendMessage(
      {
        msg: `@${senderName}\nEm có key đâu mà lấy được danh sách mấy khứa bị block trong nhóm này đâu\nHong thì ném em cái KEY :d`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
        ttl: 1000000
      },
      threadId,
      message.type
    );
  }
}

export async function handleSendFriendRequest(api, message, customMessage = "Chào Bạn, Tớ Là Bot của Vũ Xuân Kiên ạ...") {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    let mentions = message.data?.mentions || [];

    if (mentions.length === 0 && message.data?.reply) {
      mentions.push({
        uid: message.data.reply.uid,
        dName: message.data.reply.dName || "Người dùng"
      });
    }

    if (mentions.length === 0) {
      await api.sendMessage(
        {
          msg: `(@${senderName}) Dùng \`kb @mention\` hoặc trả lời tin nhắn để gửi lời mời kết bạn!`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl:360000,
        },
        message.threadId,
        message.type
      );
      return;
    }
    const successfulMentions = [];
    await Promise.all(
      mentions.map(async mention => {
        try {
          await api.sendFriendRequest(mention.uid, customMessage, "vi");
          successfulMentions.push({ 
            uid: mention.uid, 
            dName: mention.dName || "Người dùng"
          });
        } catch {}
      })
    );
    if (successfulMentions.length === 0) {
      await api.sendMessage(
        {
          msg: `(@${senderName}) ❌ Không thể gửi lời mời kết bạn đến bất kỳ ai.`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl:360000,
        },
        message.threadId,
        message.type
      );
      return;
    }
    let mentionText = `(@${senderName}), \n📩 Đã gửi lời mời kết bạn đến: `;
    let mentionPos = mentionText.length;
    const mentionData = [{ uid: senderId, pos: 0, len: senderName.length + 3 }];

    successfulMentions.forEach(mention => {
      const displayName = mention.dName || "Người dùng";
      mentionText += `(@${displayName}) \n✅✅`;
      mentionData.push({ uid: mention.uid, pos: mentionPos, len: displayName.length + 3 });
      mentionPos += displayName.length + 4;
    });
    await api.sendMessage(
      {
        msg: mentionText.trim(),
        mentions: mentionData,
        ttl:360000,
      },
      message.threadId,
      message.type
    );
  } catch (error) {
    console.error("❌ Lỗi khi gửi kết bạn:", error);
    throw error;
  }
}
export async function handleUpdateProfileName(api, message) {
  try {
      const senderId = message.data.uidFrom; // Lấy ID người gửi
      const content = message.data?.content ? message.data.content.trim() : "";
      const prefix = getGlobalPrefix(); // Nếu có prefix

      if (!content.startsWith(prefix + "setname")) {
          return;
      }

      const newName = content.replace(prefix + "setname", "").trim();
      if (!newName) {
          await sendMessageStateQuote(api, message, "Vui lòng nhập tên mới cho profile!", false, 30000);
          return;
      }

      console.log(`🔄 Đang đổi tên profile của [${senderId}] thành: ${newName}`);

      // Gọi API để đổi tên profile
      const response = await api.updateZaloName(senderId, newName);
      console.log("📌 Phản hồi từ API updateZaloName:", response);

      if (response?.success) {
          await sendMessageStateQuote(api, message, `Đã đổi tên profile của bạn thành: ${newName}`, true, 30000);
      } else {
          await sendMessageStateQuote(api, message, `❌ Không thể đổi tên. Phản hồi từ API: ${JSON.stringify(response)}`, false, 30000);
      }

  } catch (error) {
      console.error("❌ Lỗi khi đổi tên profile:", error);
      await sendMessageStateQuote(api, message, `❌ Đã xảy ra lỗi khi đổi tên profile`, false, 30000);
  }
}
export async function spamCallInGroup(api, message, aliasCommand) {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    let mentions = message.data?.mentions || [];

    // Hỗ trợ reply nếu không mention
    if (mentions.length === 0 && message.data?.reply) {
      mentions.push({
        uid: message.data.reply.uid,
        dName: message.data.reply.dName || "Người dùng"
      });
    }

    if (mentions.length === 0) {
      return sendMessageFailed(api, message, `Vui lòng mention hoặc reply người bạn muốn gọi.`);
    }

    const prefix = getGlobalPrefix();
    const rawContent = removeMention(message) || '';
    const content = rawContent.replace(`${prefix}${aliasCommand}`, '').trim();
    const args = content.split(' ');
    const count = parseInt(args[0]);

    if (isNaN(count) || count <= 0) {
      return sendMessageFailed(api, message, `Cú pháp sai. Ví dụ: ${prefix}${aliasCommand} @user 5`);
    }

    const targetUid = String(mentions[0].uid);
    const targetName = mentions[0].dName || "Người dùng";

    // Hàm sleep
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    
    for (let i = 0; i < count; i++) {
      try {
        await api.sendCallVoice(targetUid);
        console.log(`📞 Nhá máy ${i + 1}/${count} đến ${targetUid}`);
        if (i < count - 1) await sleep(3000);
      } catch (err) {
        console.error(`❌ Lỗi khi gọi lần ${i + 1}:`, err.message || err);
        break;
      }
    }
    const msg = `@${senderName} Đã dùng bí thuật ${count} lần đến @${targetName}`;
    const mentionList = [
      { uid: senderId, pos: 0, len: senderName.length + 1 },
      { uid: targetUid, pos: msg.indexOf(`@${targetName}`), len: targetName.length + 1 }
    ];

    await api.sendMessage({
      msg,
      mentions: mentionList,
      ttl: 360000,
    }, message.threadId, message.type);

  } catch (err) {
    console.error("❌ Lỗi spam call:", err);
    await sendMessageFailed(api, message, `Lỗi: ${err.message}`);
  }
}
