import { MessageStyle, MessageType } from "../../api-zalo/index.js";
import { isAdmin } from "../../index.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageResultRequest,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { readManagerFile, writeManagerFile } from "../../utils/io-json.js";
import { getNameServer, updateNameServer } from "../../../src/database/index.js";
import schedule from "node-schedule";
import fs from "fs/promises";
import path from "path";

const configPath = path.join(process.cwd(), "assets/json-data/database-config.json");

async function readDatabaseConfig() {
  try {
    const data = await fs.readFile(configPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

async function writeDatabaseConfig(newData) {
  try {
    await fs.writeFile(configPath, JSON.stringify(newData, null, 2), "utf8");
  } catch (err) {}
}

export const managerData = {
  data: readManagerFile(),
  hasChanges: false,
};

export async function notifyResetGroup(api) {
  const groupRequiredReset = managerData.data.groupRequiredReset;
  if (groupRequiredReset !== "-1") {
    let group;
    try {
      group = await api.getGroupInfo(groupRequiredReset);
    } catch (error) {
      group = null;
    }
    await sendMessageResultRequest(
      api,
      group ? MessageType.GroupMessage : MessageType.DirectMessage,
      groupRequiredReset,
      "Khởi động lại hoàn tất!\nBot đã hoạt động trở lại!",
      true,
      30000
    );
    managerData.data.groupRequiredReset = "-1";
    managerData.hasChanges = true;
  }
}

export async function exitRestartBot(api, message) {
  try {
    const threadId = message.threadId;
    managerData.data.groupRequiredReset = threadId;
    managerData.hasChanges = true;
    saveManagerData();
    await sendMessageResultRequest(api, MessageType.GroupMessage, threadId, "Tiến hành khởi động lại...", true, 12000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  } catch (error) {
    await sendMessageFailed(api, message, "Không thể tắt bot: " + error.message, false, 15000);
  }
}

const saveManagerData = () => {
  writeManagerFile(managerData.data);
  managerData.hasChanges = false;
};

schedule.scheduleJob("*/5 * * * * *", () => {
  if (managerData.hasChanges) {
    saveManagerData();
  }
});

export async function handleActiveBotUser(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();
  const botCommand = content.replace(`${prefix}bot`, "").trim();

  if (!botCommand) {
    const caption = `📖 *Hướng dẫn cho sự khởi đầu:*\n\n🔹 *Bật|tắt tương tác bot với thành viên:*\n ➤  .bot on|off\n\n🔹 *Bật|tắt chế độ game riêng tư:*\n ➤  .bot privategame on|off\n\n🔹 *Bật|tắt chế độ bot riêng tư:*\n ➤  .bot privatebot on|off\n\n🔹 *Thay đổi nameServer:*\n ➤  .bot nameserver [newNameServer]\n\n🔹 *Khởi động lại bot:*\n ➤  .bot restart`;
    await sendMessageComplete(api, message, caption);
    return true;
  }

  if (botCommand === "on" || botCommand === "off") {
    if (groupSettings) {
      const newStatus = botCommand === "on";
      groupSettings[threadId].activeBot = newStatus;
      const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
      const caption = `Đã ${statusMessage} tương tác với bot trong nhóm này.`;
      if (newStatus) {
        await sendMessageComplete(api, message, caption);
      } else {
        await sendMessageFailed(api, message, caption);
      }
    } else {
      await sendMessageFailed(api, message, "Không thể setup nhóm ở tin nhắn riêng tư!");
    }
    return true;
  }

  if (botCommand.includes("privatebot")) {
    const privateCommand = botCommand.replace("privatebot", "").trim();
    const newStatus = privateCommand === "on";
    managerData.data.onBotPrivate = newStatus;
    managerData.hasChanges = true;
    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tương tác lệnh trong tin nhắn riêng tư với tất cả người dùng.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  }

  if (botCommand.includes("privategame")) {
    const privateCommand = botCommand.replace("privategame", "").trim();
    const newStatus = privateCommand === "on";
    managerData.data.onGamePrivate = newStatus;
    managerData.hasChanges = true;
    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tương tác game trong tin nhắn riêng tư với tất cả người dùng.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  }

  if (botCommand.startsWith("nameserver")) {
    const name = botCommand.replace("nameserver", "").trim();
    if (!name) {
      const nameServer = await getNameServer();
      await sendMessageComplete(api, message, `Tên hiện tại của nameServer: ${nameServer ?? "chưa đặt."}`);
    } else {
      const dbConfig = await readDatabaseConfig();
      if (!dbConfig) {
        await sendMessageFailed(api, message, "Không thể đọc file cấu hình!", false, 10000);
        return true;
      }
      dbConfig.nameServer = name;
      await writeDatabaseConfig(dbConfig);
      await updateNameServer(name);
      await sendMessageComplete(api, message, `Đã cập nhật nameServer thành: ${name}`);
    }
    return true;
  }

  if (["restart", "rs"].includes(botCommand)) {
    if (isAdmin(senderId)) {
      await exitRestartBot(api, message);
      return true;
    }
    await sendMessageFailed(api, message, "Bạn không có quyền khởi động lại bot!");
    return true;
  }
}

export async function handleActiveGameUser(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const gameCommand = `${prefix}gameactive`;
  if (content === gameCommand || content === `${gameCommand} on` || content === `${gameCommand} off`) {
    let newStatus;
    if (content === gameCommand) {
      newStatus = !groupSettings[threadId].activeGame;
    } else {
      newStatus = content === `${gameCommand} off` ? false : true;
    }
    groupSettings[threadId].activeGame = newStatus;
    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} xử lý tương tác trò chơi trong nhóm này.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
    return true;
  }
  return false;
}
