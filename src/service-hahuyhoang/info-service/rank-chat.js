import fs from "fs";
import path from "path";
import { MessageType, MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");

function readRankInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    console.error("Lỗi khi đọc file rank-info.json:", error);
    return { groups: {} };
  }
}

function writeRankInfo(data) {
  try {
    fs.writeFileSync(rankInfoPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi ghi file rank-info.json:", error);
  }
}

export function updateUserRank(groupId, userId, userName, nameGroup) {
  const rankInfo = readRankInfo();
  if (!rankInfo.groups[groupId]) {
    rankInfo.groups[groupId] = { users: [] };
  }
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) {
    rankInfo.groups[groupId].nameGroup = nameGroup;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const userIndex = rankInfo.groups[groupId].users.findIndex((user) => user.UID === userId);

  rankInfo.groups[groupId].users.forEach((user) => {
    if (user.lastMessageDate !== currentDate) {
      user.messageCountToday = 0; 
    }
  });

  if (userIndex !== -1) {
    const user = rankInfo.groups[groupId].users[userIndex];
    user.messageCountToday++;
    user.lastMessageDate = currentDate;
    user.UserName = userName;
    user.Rank++;
  } else {
    rankInfo.groups[groupId].users.push({
      UserName: userName,
      UID: userId,
      Rank: 1,
      messageCountToday: 1,
      lastMessageDate: currentDate,
    });
  }

  writeRankInfo(rankInfo);
}

export async function handleRankCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const threadId = message.threadId;
  const uidFrom = message.data.uidFrom;

  let isToday = false;
  let targetUid = null;
  let isFromMention = false;
  let mentionPos = -1;
  let mentionLen = 0;

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUid = uidFrom;
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      const mention = message.data.mentions[0];
      targetUid = mention.uid;
      isFromMention = true;
      mentionPos = mention.pos;
      mentionLen = mention.len;
    } else if (args.length > 1) {
      targetUid = args[1];
    }
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    const mention = message.data.mentions[0];
    targetUid = mention.uid;
    isFromMention = true;
    mentionPos = mention.pos;
    mentionLen = mention.len;
  } else if (args.length > 0) {
    targetUid = args[0];
  }

  const rankInfo = readRankInfo();
  const groupUsers = rankInfo.groups[threadId]?.users || [];

  if (groupUsers.length === 0) {
    await api.sendMessage(
      { msg: "Chưa có dữ liệu topchat cho nhóm này.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  let targetUser = null;
  let messageMentions = [];
  let responseMsg = "";

  if (targetUid) {
    targetUser = groupUsers.find(user => user.UID === targetUid);
    if (!targetUser) {
      await api.sendMessage(
        { msg: `Không tìm thấy dữ liệu topchat cho user: ${targetUid}`, quote: message },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }

    let count = 0;
    if (isToday) {
      const currentDate = new Date().toISOString().split("T")[0];
      count = targetUser.lastMessageDate === currentDate ? targetUser.messageCountToday : 0;
    } else {
      count = targetUser.Rank;
    }

    let userName = targetUser.UserName;
    if (isFromMention) {
      userName = "@" + message.data.content.substr(mentionPos, mentionLen).replace("@", "");
      const mentionPosition = responseMsg.length + 18;
      messageMentions.push(MessageMention(targetUid, userName.length, mentionPosition));
    }

    responseMsg = `📊 ${isToday ? "Hôm nay" : "Tổng"} topchat của ${userName}: ${count} tin nhắn`;
  } else {
    if (isToday) {
      const currentDate = new Date().toISOString().split("T")[0];
      const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDate);
      if (todayUsers.length === 0) {
        await api.sendMessage(
          { msg: "Chưa có người dùng nào tương tác hôm nay.", quote: message },
          threadId,
          MessageType.GroupMessage
        );
        return;
      }
      const sortedUsers = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday);
      const top10Users = sortedUsers.slice(0, 10);

      responseMsg = "🏆 Bảng topchat hôm nay:\n\n";
      top10Users.forEach((user, index) => {
        responseMsg += `${index + 1}. ${user.UserName}: ${user.messageCountToday} tin nhắn\n`;
      });
    } else {
      const sortedUsers = groupUsers.sort((a, b) => b.Rank - a.Rank); 
      const top10Users = sortedUsers.slice(0, 10);
      responseMsg = "🏆 Bảng topchat:\n\n";
      top10Users.forEach((user, index) => {
        responseMsg += `${index + 1}. ${user.UserName}: ${user.Rank} tin nhắn\n`;
      });
      responseMsg += `\nDùng ${prefix}${aliasCommand} today để xem topchat hàng ngày.`;
    }
  }

  if (messageMentions.length > 0) {
    await api.sendMessage({ msg: responseMsg, mentions: messageMentions, quote: message, ttl: 600000 }, threadId, MessageType.GroupMessage);
  } else {
    await api.sendMessage({ msg: responseMsg, quote: message, ttl: 600000 }, threadId, MessageType.GroupMessage);
  }
}

export async function initRankSystem() {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();

  for (const [groupId, groupData] of Object.entries(groupSettings)) {
    if (!rankInfo.groups[groupId]) {
      rankInfo.groups[groupId] = { users: [] };
    }

    if (groupData["adminList"]) {
      for (const [userId, userName] of Object.entries(groupData["adminList"])) {
        const existingUser = rankInfo.groups[groupId].users.find((user) => user.UID === userId);
        if (!existingUser) {
          rankInfo.groups[groupId].users.push({
            UserName: userName,
            UID: userId,
            Rank: 0,
          });
        }
      }
    }
  }

  writeRankInfo(rankInfo);
}
