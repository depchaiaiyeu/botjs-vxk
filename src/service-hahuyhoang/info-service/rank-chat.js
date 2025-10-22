import fs from "fs";
import path from "path";
import { MessageType, MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { createRankImage } from "./canvas/rank-canvas.js";

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
  let targetName = "";

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUid = uidFrom;
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      const mention = message.data.mentions[0];
      targetUid = mention.uid;
      targetName = message.data.content.substr(mention.pos, mention.len).replace("@", "").trim();
    }
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    const mention = message.data.mentions[0];
    targetUid = mention.uid;
    targetName = message.data.content.substr(mention.pos, mention.len).replace("@", "").trim();
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

  let responseMsg = "";

  if (targetUid) {
    const targetUser = groupUsers.find(user => user.UID === targetUid);
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

    const userName = targetName || targetUser.UserName;
    responseMsg = `📊${isToday ? " Hôm nay" : " Tổng"} số tin nhắn mà người dùng ${userName} đã nhắn là: ${count}`;
    await api.sendMessage({ msg: responseMsg, quote: message, ttl: 600000 }, threadId, MessageType.GroupMessage);
  } else {
    let rankData = [];
    let title = "";
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
      rankData = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday).slice(0, 10);
      title = "🏆 Bảng xếp hạng tin nhắn hôm nay:";
    } else {
      rankData = groupUsers.sort((a, b) => b.Rank - a.Rank).slice(0, 10);
      title = "🏆 Bảng xếp hạng tin nhắn:";
    }

    let filePath = null;
    try {
      filePath = await createRankImage(rankData, title, api);
      await api.sendMessage(
        {
          attachments: [filePath],
        },
        threadId,
        message.type
      );
    } catch (error) {
      console.error("Lỗi khi tạo hình ảnh topchat:", error);
      responseMsg = isToday ? "🏆 Bảng topchat hôm nay:\n\n" : "🏆 Bảng topchat:\n\n";
      rankData.forEach((user, index) => {
        const count = isToday ? user.messageCountToday : user.Rank;
        responseMsg += `${index + 1}. ${user.UserName}: ${count} tin nhắn\n`;
      });
      if (!isToday) {
        responseMsg += `\nDùng ${prefix}${aliasCommand} today để xem topchat hàng ngày.`;
      }
      await api.sendMessage({ msg: responseMsg, quote: message, ttl: 600000 }, threadId, MessageType.GroupMessage);
    }
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
