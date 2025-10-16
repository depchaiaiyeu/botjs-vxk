import { MessageType } from "zlbotdqt";
import { getDataAllGroup } from "../service-hahuyhoang/info-service/group-info.js";
import { readWebConfig } from "../utils/io-json.js";

let bulkMessageInterval = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBulkMessage(api, socket, data) {
  const { content, interval, filePaths, sendDelay = 500 } = data;
 // const { content, interval, filePaths } = data;
  console.log("Nhận yêu cầu startBulkMessage:", content, interval);
  const bulkMessageContent = content;
  const bulkImageUrls = filePaths;
  if (bulkMessageInterval) {
    clearInterval(bulkMessageInterval);
  }

  const sendMessages = async () => {
    const webConfig = readWebConfig();
    const selectedFriends = webConfig.selectedFriends;
    const selectedGroups = webConfig.selectedGroups;

    for (const friendId in selectedFriends) {
      if (selectedFriends[friendId]) {
        try {
          await api.sendMessagev1(
            {
              msg: bulkMessageContent,
              attachments: bulkImageUrls,
              ttl: interval,
            },
            friendId,
            MessageType.DirectMessage
          );
        } catch (error) {
        }
        await sleep(sendDelay);
      }
    }

    for (const groupId in selectedGroups) {
      if (selectedGroups[groupId]) {
        try {
          await api.sendMessagev1(
            {
              msg: bulkMessageContent,
              attachments: bulkImageUrls,
              ttl: interval,
            },
            groupId,
            MessageType.GroupMessage
          );
        } catch (error) {
        }
        await sleep(sendDelay);
      }
    }
  };

  await sendMessages();

  bulkMessageInterval = setInterval(sendMessages, interval);

  console.log("Đã bắt đầu gửi tin nhắn hàng loạt");
  socket.emit("bulkMessageStatus", "started");
}

export async function stopBulkMessage() {
  if (bulkMessageInterval) {
    clearInterval(bulkMessageInterval);
    bulkMessageInterval = null;
  }
}
