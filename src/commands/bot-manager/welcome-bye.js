import { sendMessageStateQuote, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleWelcomeBye(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId][command === `${prefix}welcome` ? "welcomeGroup" : "byeGroup"];
  } else {
    await sendMessageWarning(
      api,
      message,
      "Cú pháp không hợp lệ. Vui lòng sử dụng '!welcome [on/off]' hoặc '!bye [on/off]'."
    );
    return false;
  }

  if (command === `${prefix}welcome`) {
    groupSettings[threadId].welcomeGroup = newStatus;
  } else if (command === `${prefix}bye`) {
    groupSettings[threadId].byeGroup = newStatus;
  }

  const status = newStatus ? "bật" : "tắt";
  const feature = command === `${prefix}welcome` ? "chào mừng thành viên mới" : "tạm biệt thành viên rời nhóm";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng ${feature}!`, newStatus, 300000);
  return true;
}

export async function handleApprove(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId].memberApprove;
  } else {
    await sendMessageWarning(
      api,
      message,
      "Cú pháp không hợp lệ. Vui lòng sử dụng '!approve [on/off]'."
    );
    return false;
  }

  groupSettings[threadId].memberApprove = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng tự động phê duyệt thành viên mới!`, newStatus, 300000);
  if (newStatus) {
    await api.handleGroupPendingMembers(threadId, true);
  }
  return true;
}
