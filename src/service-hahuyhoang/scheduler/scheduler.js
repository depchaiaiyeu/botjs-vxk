import schedule from "node-schedule";
import fs from "fs";
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js";
import { MessageType } from "../../api-zalo/index.js";
import { getRandomVideoFromArray, searchVideoTiktok } from "../api-crawl/tiktok/tiktok-service.js";
import { sendRandomGirlVideo } from "../chat-zalo/chat-special/send-video/send-video.js";
import path from "path";

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

const scheduledTasks = [
  {
    cronExpression: "15 6 * * *",
    task: async (api) => {
      const caption = `-> SendTask 06:05 <-\nThức dậy cho một ngày mới\nđầy năng lượng thôi nào!\n\nĐón bình minh ngày mới cùng tớ nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskVideo(api, caption, timeToLive, "ngắm bình minh chill");
    },
  },
  {
    cronExpression: "5 9 * * *",
    task: async (api) => {
      const caption = `-> SendTask 09:05 <-\nChào buổi sáng\ncùng đón nắng ấm suơng mưa nhé!\n\nGiải trí một chút để bớt căng thẳng thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskVideo(api, caption, timeToLive, "nhạc chill cảnh đẹp");
    },
  },
  {
    cronExpression: "5 10 * * *",
    task: async (api) => {
      const caption = `-> SendTask 10:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 11 * * *",
    task: async (api) => {
      const caption = `-> SendTask 11:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 12 * * *",
    task: async (api) => {
      const caption = `-> SendTask 12:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    cronExpression: "5 13 * * *",
    task: async (api) => {
      const caption = `-> SendTask 13:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    cronExpression: "5 14 * * *",
    task: async (api) => {
      const caption = `-> SendTask 14:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 15 * * *",
    task: async (api) => {
      const caption = `-> SendTask 15:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 16 * * *",
    task: async (api) => {
      const caption = `-> SendTask 16:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    cronExpression: "5 17 * * *",
    task: async (api) => {
      const caption = `-> SendTask 17:05 <-\nChúc buổi chiều thật chill và vui vẻ nhé!\n\nĐón hoàng hôn ánh chiều tà thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 2;
      await sendTaskVideo(api, caption, timeToLive, "ngắm hoàng hôn chill");
    },
  },
  {
    cronExpression: "5 19 * * *",
    task: async (api) => {
      const caption = `-> SendTask 19:05 <-\nChúc các bạn một buổi tối vui vẻ bên gia đình!\n\nThư giãn cuối ngày thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskVideo(api, caption, timeToLive, "âm nhạc nhẹ nhàng");
    },
  },
  {
    cronExpression: "5 22 * * *",
    task: async (api) => {
      const caption = `-> SendTask 22:05 <-\nTổng kết tương tác trong ngày 📝\n\n`;
      const timeToLive = 1000 * 60 * 60 * 8;
      await sendTaskTopChat(api, caption, timeToLive);
    },
  }
];

async function sendTaskGirlVideo(api, caption, timeToLive, type = "default") {
  const groupSettings = readGroupSettings();
  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        const message = {
          threadId: threadId,
          type: MessageType.GroupMessage,
        };
        await sendRandomGirlVideo(api, message, caption, type, timeToLive);
      } catch (error) {
        console.error(`Lỗi khi gửi video gái in ${threadId}:`, error);
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false;
          writeGroupSettings(groupSettings);
        }
      }
    }
  }
}

async function sendTaskVideo(api, caption, timeToLive, query) {
  const chillListVideo = await searchVideoTiktok(query);
  if (chillListVideo) {
    const groupSettings = readGroupSettings();
    let captionFinal = `${caption}`;
    for (const threadId of Object.keys(groupSettings)) {
      if (groupSettings[threadId].sendTask) {
        try {
          const message = {
            threadId: threadId,
            type: MessageType.GroupMessage,
          };
          const videoUrl = await getRandomVideoFromArray(api, message, chillListVideo);
          await api.sendVideo({
            videoUrl: videoUrl,
            threadId: message.threadId,
            threadType: message.type,
            message: {
              text: captionFinal,
            },
            ttl: timeToLive,
          });
        } catch (error) {
          console.error(`Lỗi khi gửi video tiktok in ${threadId}:`, error);
          if (error.message && error.message.includes("không tồn tại")) {
            groupSettings[threadId].sendTask = false;
            writeGroupSettings(groupSettings);
          }
        }
      }
    }
  }
}

async function sendTaskTopChat(api, caption, timeToLive) {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();
  const currentDate = new Date().toISOString().split("T")[0];

  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        const groupUsers = rankInfo.groups[threadId]?.users || [];
        
        if (groupUsers.length === 0) {
          continue;
        }

        const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDate);
        
        if (todayUsers.length === 0) {
          continue;
        }

        const sortedUsers = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday);
        const top10Users = sortedUsers.slice(0, 10);
        
        const totalMessages = todayUsers.reduce((sum, user) => sum + user.messageCountToday, 0);

        let rankMessage = `${caption}📊 Thống kê tương tác của hôm nay:\n💬 Tổng số tin nhắn: ${totalMessages}\n\n🏆 Top tương tác:\n`;
        
        top10Users.forEach((user, index) => {
          rankMessage += `${index + 1}. ${user.UserName}: ${user.messageCountToday} tin nhắn\n`;
        });

        await api.sendMessage(
          { msg: rankMessage, ttl: timeToLive },
          threadId,
          MessageType.GroupMessage
        );
      } catch (error) {
        console.error(`Lỗi khi gửi top chat in ${threadId}:`, error);
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false;
          writeGroupSettings(groupSettings);
        }
      }
    }
  }
}

export async function initializeScheduler(api) {
  scheduledTasks.forEach((taskConfig) => {
    schedule.scheduleJob(taskConfig.cronExpression, () => {
      taskConfig.task(api).catch((error) => {
        console.error("Lỗi khi thực thi tác vụ định kỳ:", error);
      });
    });
  });
}
