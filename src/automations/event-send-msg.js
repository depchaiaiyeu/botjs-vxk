import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotdqt";
import { getIO } from "../web-service/web-server.js";
import { getBotId, isAdmin, admins, checkDisableProphylacticConfig } from "../index.js";
import { antiLink } from "../service-hahuyhoang/anti-service/anti-link.js";
import { antiSpam } from "../service-hahuyhoang/anti-service/anti-spam.js";
import { antiBadWord } from "../service-hahuyhoang/anti-service/anti-badword.js";
import { antiBot } from "../service-hahuyhoang/anti-service/anti-bot.js";
import { autoDownload } from "../service-hahuyhoang/api-crawl/api-hahuyhoangbot/auto-download.js";
import { antiNotText } from "../service-hahuyhoang/anti-service/anti-not-text.js";
import { handleMute } from "../service-hahuyhoang/anti-service/mute-user.js";
import { antiMedia } from "../service-hahuyhoang/anti-service/anti-media.js";
import { antiSticker } from "../service-hahuyhoang/anti-service/anti-sticker.js";
import { antiLinkKeyword } from "../service-hahuyhoang/anti-service/anti-keyword-link.js";
import { antiForward } from "../service-hahuyhoang/anti-service/anti-forward.js";
import { handleWordChainMessage } from "../service-hahuyhoang/game-service/mini-game/wordChain.js";
import { Reactions } from "../api-zalo/index.js";
import { handleOnChatUser, handleOnReplyFromUser } from "../service-hahuyhoang/service.js";
import { chatWithSimsimi } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { handleChatBot } from "../service-hahuyhoang/chat-bot/bot-learning/dqt-bot.js";

import { getGroupAdmins, getGroupInfoData } from "../service-hahuyhoang/info-service/group-info.js";
import { getUserInfoData } from "../service-hahuyhoang/info-service/user-info.js";

import { handleAdminHighLevelCommands } from "../commands/bot-manager/admin-manager.js";

import { updateUserRank } from "../service-hahuyhoang/info-service/rank-chat.js";

import { pushMessageToWebLog } from "../utils/io-json.js";
import { handleCommand, initGroupSettings, handleCommandPrivate } from "../commands/command.js";
import { logMessageToFile, readGroupSettings } from "../utils/io-json.js";

import { superCheckBox } from "./vxk-test.js";
import { antiNude } from "../service-hahuyhoang/anti-service/anti-nude/anti-nude.js";
import { isUserBlocked } from "../commands/bot-manager/group-manage.js";

const userLastMessageTime = new Map();
const COOLDOWN_TIME = 1000;

const lastBusinessCardTime = new Map();
const BUSINESS_CARD_COOLDOWN = 5 * 60 * 1000;

async function canReplyToUser(senderId) {
  const currentTime = Date.now();
  const lastMessageTime = userLastMessageTime.get(senderId);

  if (!lastMessageTime || currentTime - lastMessageTime >= COOLDOWN_TIME) {
    userLastMessageTime.set(senderId, currentTime);
    return true;
  }
  return false;
}

export async function checkAndSendBusinessCard(api, senderId, senderName) {
  if (isAdmin(senderId)) return false;
  const currentTime = Date.now();
  const lastSentTime = lastBusinessCardTime.get(senderId);

  if (!lastSentTime || currentTime - lastSentTime >= BUSINESS_CARD_COOLDOWN) {
    lastBusinessCardTime.set(senderId, currentTime);
    const idBot = getBotId();
    if (admins.length == 0 || (admins.length == 1 && admins.includes(idBot.toString()))) return false;
    //await api.sendMessage(
      //{
        //msg:
          //`Xin Chào ${senderName}, Tôi Là Vũ Xuân Kiên.\n` +
          //`Hiện Tại Tôi Đang Bận Bạn Có Thể Nhắn Lại Sau Nhé.\n`+
          //`Link Group Của Tôi: https://zalo.me/g/cytzbq576\n`,
      //},
      //senderId,
      //MessageType.DirectMessage
    //);
    for (const userId of admins) {
      if (userId != idBot) {
        //await api.sendBusinessCard(null, userId, null, MessageType.DirectMessage, senderId);
      }
    }
    return true;
  }
  return false;
}

schedule.scheduleJob("*/1 * * * *", () => {
  const currentTime = Date.now();
  for (const [userId, lastTime] of userLastMessageTime.entries()) {
    if (currentTime - lastTime > 60000) {
      userLastMessageTime.delete(userId);
    }
  }
  for (const [userId, lastTime] of lastBusinessCardTime.entries()) {
    if (currentTime - lastTime > BUSINESS_CARD_COOLDOWN) {
      lastBusinessCardTime.delete(userId);
    }
  }
  checkDisableProphylacticConfig();
});

export async function messagesUser(api, message) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  let content = message.data.content;
  const isPlainText = typeof message.data.content === "string";
  const senderName = message.data.dName;
  let isAdminLevelHighest = false;
  let isAdminBot = false;
  isAdminLevelHighest = isAdmin(senderId);
  isAdminBot = isAdmin(senderId, threadId);
  const idBot = getBotId();
  const io = getIO();
  let isSelf = idBot === senderId;

  const contentText = isPlainText
    ? content
    : content.href
      ? "Caption: " + content.title + "\nLink: " + content.href
      : content.catId
        ? "Sticker ID: " + content.id + " | " + content.catId + " | " + content.type
        : null;

  switch (message.type) {
    case MessageType.DirectMessage: {
      const userInfo = await getUserInfoData(api, senderId);
      pushMessageToWebLog(io, "Tin Nhắn Riêng Tư", senderName, content, userInfo.avatar);
      if (isPlainText) {
        content = content.trim();
        const logMessage = `Có Mesage Riêng tư mới:
      - Sender Name: [ ${senderName} ] | ID: ${threadId}
      - Content: ${contentText}\n\n`;
        logMessageToFile(logMessage);
        let continueProcessingChat = true;
        continueProcessingChat = !isUserBlocked(senderId);
        continueProcessingChat = continueProcessingChat && (await canReplyToUser(senderId));
        continueProcessingChat = continueProcessingChat && !(await handleOnReplyFromUser(api, message));
        if (continueProcessingChat) {
          const commandResult = await handleCommandPrivate(api, message);
          continueProcessingChat = continueProcessingChat && commandResult === 1 && !isSelf;
          continueProcessingChat =
            continueProcessingChat && !(!isSelf && (await checkAndSendBusinessCard(api, senderId, senderName)));
        }
      }
      break; 
    } 
    case MessageType.GroupMessage: {
      let groupAdmins = [];
      let nameGroup = "";
      let isAdminBox = false;
      let botIsAdminBox = false;
      let groupInfo = {};
      if (threadId) {
        groupInfo = await getGroupInfoData(api, threadId);
        groupAdmins = await getGroupAdmins(groupInfo);
        botIsAdminBox = groupAdmins.includes(idBot.toString());
        nameGroup = groupInfo.name;
        isAdminBox = isAdmin(senderId, threadId, groupAdmins);
      }

      if (isPlainText) {
        content = content.trim();
      }

      const logMessage = `Có Mesage nhóm mới:
              - Tên Nhóm: ${nameGroup} | Group ID: ${threadId}
              - Người Gửi: ${senderName} | Sender ID: ${senderId}
              - Nội Dung: ${contentText}\n\n`;
      logMessageToFile(logMessage);

      const groupSettings = readGroupSettings();
      initGroupSettings(groupSettings, threadId, nameGroup);
      pushMessageToWebLog(io, nameGroup, senderName, content, groupInfo.avt);

      if (!isSelf) {
        updateUserRank(threadId, senderId, message.data.dName, nameGroup);
      }

      let handleChat = true;
      handleChat = handleChat && !(await superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox, groupSettings));
      handleChat = handleChat && !(await antiBot(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await autoDownload(api, message, isSelf, groupSettings));
      handleChat = handleChat && !(await antiSpam(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiMedia(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiSticker(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = !(await handleMute(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiBadWord(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !isUserBlocked(senderId);
      const numberHandleCommand = await handleCommand(
        api,
        message,
        groupInfo,
        groupAdmins,
        groupSettings,
        isAdminLevelHighest,
        isAdminBot,
        isAdminBox,
        handleChat
      );
      if (isPlainText) {
        handleChat = handleChat && groupSettings[threadId].activeBot === true;
        handleChat = handleChat && !isSelf;
        if (handleChat || (!isSelf && isAdminBot)) {
          await handleOnChatUser(api, message, numberHandleCommand === 5, groupSettings);
        }
        if (handleChat || isAdminBot) {
          handleChat = await handleOnReplyFromUser(
            api,
            message,
            groupInfo,
            groupAdmins,
            groupSettings,
            isAdminLevelHighest,
            isAdminBot,
            isAdminBox,
            handleChat || isAdminBot
          );
        }
        if (!isSelf) {
          await handleChatBot(api, message, threadId, groupSettings, nameGroup, numberHandleCommand === 2);
        }
      }

      await Promise.all([
        antiLink(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiLinkKeyword(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiNotText(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiForward(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        handleWordChainMessage(api, message)
      ]);
      break;
    }
  }
}
