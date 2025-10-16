import fs from "fs";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import {
  sendMessageComplete,
  sendMessageFromSQL,
  sendMessageStateQuote,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";
const filePath = "./data/groupSpamList.json";

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

let arrListGroupSpam = [];
function initializeGroupSpamList() {
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync("./data", { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }
}
function loadGroupSpamList() {
    if (fs.existsSync(filePath)) {
        arrListGroupSpam = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
}
function saveGroupSpamList() {
    fs.writeFileSync(filePath, JSON.stringify(arrListGroupSpam, null, 2));
}
function getListGroupSpamWithoutJoin() {
    return arrListGroupSpam;
}
function addGroupToSpamList(groupId) {
    if (!arrListGroupSpam.includes(groupId)) {
        arrListGroupSpam.push(groupId);
        saveGroupSpamList();
    }
}
function removeGroupFromSpamList(groupId) {
    arrListGroupSpam = arrListGroupSpam.filter(id => id !== groupId);
    saveGroupSpamList();
}
initializeGroupSpamList();
loadGroupSpamList();

let isPauseProcessing = false;

export async function handleSendMessageGroupNotJoin(
  api,
  message,
  aliasCommand
) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const keyword = content.replace(prefix + aliasCommand, "").trim();
  const [link, text = "", numberSend = 1, ttl = 0, timeout = 300] =
    keyword.split("|");

  if (!link) {
    await sendMessageStateQuote(
      api,
      message,
      `Cú pháp câu lệnh:\n` +
        `${prefix}${aliasCommand} link nhóm|nội dung|số lần gửi|time to live|delay gửi tin\n` +
        `Link nhóm và nội dung nhóm bắt buộc điền\n` +
        "Các đối số còn lại không bắt buộc\n" +
        `VD: ${prefix}${aliasCommand} link.zalo|noi dung send hoac ghi random|3|30000|1000`,
      false,
      60000,
      false
    );
    return;
  }

  if (link.toLowerCase() === "stop") {
    isPauseProcessing = true;
    await sendMessageComplete(
      api,
      message,
      "Success Shutdown Spam Group Without Join!!!",
      true
    );
    return;
  }

  let groupInfo = null;
  try {
    groupInfo = await api.getGroupInfoByLink(link);
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Link này không tồn tại nhóm/cộng đồng nào!`,
      },
      true,
      30000
    );
    return;
  }

  if (!groupInfo.setting.joinAppr) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Nhóm này đã tắt phê duyệt thành viên, không chơi spam được rồi!!!`,
      },
      true,
      30000
    );
    return;
  }

  const { groupId, name } = groupInfo;

  if (!text) {
    await sendMessageWarning(
      api,
      message,
      "Sếp chưa nhập nội dung cần gửi",
      false
    );
    return;
  }

  try {
    await api.joinGroup(link);
  } catch (error) {
    if (error.message.includes("Waiting for approve")) {
      addGroupToSpamList(groupId);
    } else if (error.message.includes("chặn tham gia nhóm")) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Đã bị chặn ở nhóm này, không thể thực hiện gửi tin nhắn vào nhóm!`,
        },
        true,
        30000
      );
      return;
    }
  }

  let countComplete = 0;
  let isRunning = true;

  await sendMessageComplete(
    api,
    message,
    `Tiến hành gửi tin nhắn đến nhóm ${name}!`,
    true
  );

  const spamTask = async () => {
    const numberSendInt = parseInt(numberSend);
    for (let i = 0; i < numberSendInt; i++) {
      if (!isRunning) break;

      try {
        await api.sendMessage(
          {
            msg: text,
            ttl: ttl,
          },
          groupId,
          1
        );
        countComplete++;
        await api.leaveGroup(groupId);
        removeGroupFromSpamList(groupId);
      } catch (error) {}

      await new Promise((resolve) => setTimeout(resolve, timeout));
      if (isPauseProcessing) {
        isPauseProcessing = false;
        break;
      }
    }
    isRunning = false;
  };

  await spamTask();

  await sendMessageComplete(
    api,
    message,
    `Đã gửi ${countComplete} tin nhắn đến nhóm ${name} với time to live là ${ttl} giây trong khoảng thời gian ${
      timeout * countComplete
    } giây`,
    true
  );
}
