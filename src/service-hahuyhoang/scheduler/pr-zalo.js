import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import { MessageType } from "zlbotdqt";
import { readWebConfig } from "../../utils/io-json.js";
import { getBotId } from "../../index.js";
import { getDataAllGroup, getGroupAdmins } from "../info-service/group-info.js";

const IMAGE_PR_PATH = path.join(process.cwd(), "assets", "web-config", "image-pr");

// Thêm hàm mới để tính thời gian sống của tin nhắn
function calculateTimeLive(currentTime, prObjects) {
  const sortedPRs = prObjects
    .flatMap((obj) => obj.thoiGianGui.map((time) => ({ time, object: obj })))
    .sort((a, b) => {
      const timeA = new Date(currentTime.toDateString() + " " + a.time);
      const timeB = new Date(currentTime.toDateString() + " " + b.time);
      return timeA - timeB;
    });

  const currentIndex = sortedPRs.findIndex(
    (pr) =>
      pr.time ===
      `${currentTime.getHours().toString().padStart(2, "0")}:${currentTime.getMinutes().toString().padStart(2, "0")}`
  );

  if (currentIndex === -1) return 0;

  const nextPRIndex = (currentIndex + 1) % sortedPRs.length;
  const nextPRTime = new Date(currentTime.toDateString() + " " + sortedPRs[nextPRIndex].time);

  if (nextPRIndex <= currentIndex) {
    nextPRTime.setDate(nextPRTime.getDate() + 1);
  }

  return nextPRTime.getTime() - currentTime.getTime();
}

// Cập nhật hàm sendPRMessage
async function sendPRMessage(api, prObject, ttl) {
  const { idZalo, noiDung, hinhAnh, ten } = prObject;

  const webConfig = readWebConfig();
  const selectedFriends = webConfig.selectedFriends;
  const selectedGroups = webConfig.selectedGroups;
  const idBot = getBotId();

  try {
    const attachments = await Promise.all(
      hinhAnh.map(async (imageName) => {
        const fullPath = path.join(IMAGE_PR_PATH, imageName);
        return fullPath;
      })
    );

    // PR All Group
     const groups = await getDataAllGroup(api);
     for (const group of groups) {
       const groupAdmins = await getGroupAdmins(group);
      if (!groupAdmins.includes(idBot)) {
         try {
           await api.sendMessage(
             {
               msg: noiDung,
               attachments: attachments ? attachments : [],
               ttl: ttl,
             },
             group.groupId,
             MessageType.GroupMessage
           );
           await api.sendBusinessCard(null, idZalo, ten, MessageType.GroupMessage, group.groupId, ttl);
           // console.log(`Đã gửi tin nhắn đến nhóm ${group.groupId}`);
         } catch (error) {
           console.error(`Lỗi khi gửi tin nhắn đến nhóm ${group.groupId}:`, error);
         }
       }
     }

    //PR For Selected Group
    for (const groupId in selectedGroups) {
      if (selectedGroups[groupId]) {
        if (idZalo != -1) {
          try {
            await api.sendBusinessCard(null, idZalo, ten, MessageType.GroupMessage, groupId, ttl);
          } catch (error) {}
        }
        try {
          await api.sendMessage(
            {
              msg: noiDung,
              attachments: attachments ? attachments : [],
              ttl: ttl,
            },
            groupId,
            MessageType.GroupMessage
          );
        } catch (error) {}
      }
    }

    for (const friendId in selectedFriends) {
      if (selectedFriends[friendId]) {
        if (idZalo != -1) {
          try {
            await api.sendBusinessCard(null, idZalo, null, MessageType.DirectMessage, friendId, ttl);
          } catch (error) {}
        }
        try {
          await api.sendMessage(
            {
              msg: noiDung,
              attachments: attachments ? attachments : [],
              ttl: ttl,
            },
            friendId,
            MessageType.DirectMessage
          );
        } catch (error) {}
      }
    }

    console.log(`Đã gửi PR thành công cho ${prObject.ten}`);
  } catch (error) {
    console.error(`Lỗi khi gửi PR cho ${prObject.ten}:`, error);
  }
}

// Cập nhật hàm schedulePR
async function schedulePR(api) {
  schedule.scheduleJob("*/1 * * * *", async function () {
    const config = await readWebConfig();
    const currentTime = new Date();
    const currentHourMinute = `${currentTime.getHours().toString().padStart(2, "0")}:${currentTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    const ttl = calculateTimeLive(currentTime, config.prObjects);

    for (const prObject of config.prObjects) {
      if (prObject.thoiGianGui.includes(currentHourMinute)) {
        await sendPRMessage(api, prObject, ttl);
      }
    }
  });
}

export async function initPRService(api) {
  await schedulePR(api);
  console.log(chalk.yellow("Dịch vụ PR đã khởi tạo thành công"));
}
