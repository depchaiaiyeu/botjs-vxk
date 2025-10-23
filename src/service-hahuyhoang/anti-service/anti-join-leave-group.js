import schedule from "node-schedule";
import { MessageType } from "zlbotdqt";
import { GroupEventType } from "../../api-zalo/models/GroupEvent.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { writeGroupSettings } from "../../utils/io-json.js";

const CONFIG = {
  JOIN_THRESHOLD: 1,
  JOIN_TIME_WINDOW: 1000,
  LONG_TIME_WINDOW: 30000,
  LONG_THRESHOLD: 1,
  JOIN_LEAVE_THRESHOLD: 1,
  CLEANUP_INTERVAL: "*/5 * * * * *",
  KICKED_USER_TIMEOUT: 1000
};

const userJoinTimestamps = new Map();
const userLeaveTimestamps = new Map();
const kickedUsers = new Set();
let isLocked = false;

async function withLock(fn) {
  while (isLocked) await new Promise(r => setTimeout(r, 10));
  isLocked = true;
  try {
    return await fn();
  } finally {
    isLocked = false;
  }
}

export async function antiJoinLeave(api, event, isAdminBox, groupSettings, botIsAdminBox, isSelf, userId) {
  try {
    if (!event || !api || !groupSettings) return false;
    const senderId = userId || event.data?.sourceId || event.data?.actorId || event.data?.uid;
    const senderName = event.data?.actorName || event.data?.dName || "Không xác định";
    const { threadId, type } = event;
    const timestamp = Number(event.data?.ts || event.data?.timestamp || Date.now());
    if (!senderId || !threadId || isNaN(timestamp)) return false;

    if (isAdminBox || kickedUsers.has(senderId) || isSelf || !botIsAdminBox || isInWhiteList(groupSettings, threadId, senderId) || !groupSettings[threadId]?.antiJoinLeave) 
      return false;

    if (type !== GroupEventType.JOIN && type !== GroupEventType.LEAVE) return false;

    return await withLock(async () => {
      const joinTimestamps = userJoinTimestamps.get(senderId) || [];
      const leaveTimestamps = userLeaveTimestamps.get(senderId) || [];

      if (type === GroupEventType.JOIN) joinTimestamps.push({ time: timestamp });
      else if (type === GroupEventType.LEAVE) leaveTimestamps.push({ time: timestamp });

      const now = Date.now();
      const recentJoins = joinTimestamps.filter(j => now - j.time <= CONFIG.JOIN_TIME_WINDOW);
      const recentLeaves = leaveTimestamps.filter(l => now - l.time <= CONFIG.JOIN_TIME_WINDOW);
      const longTermJoins = joinTimestamps.filter(j => now - j.time <= CONFIG.LONG_TIME_WINDOW);

      userJoinTimestamps.set(senderId, longTermJoins);
      userLeaveTimestamps.set(senderId, recentLeaves);

      const totalJoinLeave = recentJoins.length + recentLeaves.length;
      if (recentJoins.length > CONFIG.JOIN_THRESHOLD || totalJoinLeave > CONFIG.JOIN_LEAVE_THRESHOLD || longTermJoins.length > CONFIG.LONG_THRESHOLD) {
        await api.blockUsers(threadId, [senderId]);
        kickedUsers.add(senderId);
        await handleJoinLeaveDetected(api, threadId, senderId);
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

async function handleJoinLeaveDetected(api, threadId, senderId) {
  try {
    await api.sendMessage({ msg: "Bạn đã bị chặn do tham gia nhóm quá nhiều lần trong thời gian ngắn!", ttl: 60000 }, threadId, MessageType.GroupMessage);
  } catch {}
  setTimeout(() => {
    kickedUsers.delete(senderId);
    userJoinTimestamps.delete(senderId);
    userLeaveTimestamps.delete(senderId);
  }, CONFIG.KICKED_USER_TIMEOUT);
}

schedule.scheduleJob(CONFIG.CLEANUP_INTERVAL, () => {
  const now = Date.now();
  for (const [id, joins] of userJoinTimestamps) {
    const recent = joins.filter(j => now - j.time <= CONFIG.LONG_TIME_WINDOW);
    if (recent.length) userJoinTimestamps.set(id, recent);
    else userJoinTimestamps.delete(id);
  }
  for (const [id, leaves] of userLeaveTimestamps) {
    const recent = leaves.filter(l => now - l.time <= CONFIG.JOIN_TIME_WINDOW);
    if (recent.length) userLeaveTimestamps.set(id, recent);
    else userLeaveTimestamps.delete(id);
  }
});

export async function handleAntiJoinLeaveCommand(api, message, groupSettings) {
  try {
    if (!api || !message || !groupSettings) return false;
    const { threadId } = message;
    const content = removeMention(message);
    const status = content.split(" ")[1]?.toLowerCase();
    if (!groupSettings[threadId]) groupSettings[threadId] = { antiJoinLeave: false };

    const prev = groupSettings[threadId].antiJoinLeave;
    groupSettings[threadId].antiJoinLeave = status === "on" ? true : status === "off" ? false : !prev;

    const text = groupSettings[threadId].antiJoinLeave ? "bật" : "tắt";
    await sendMessageStateQuote(api, message, `Chức năng chống spam tham gia-rời nhóm đã được ${text}!`, groupSettings[threadId].antiJoinLeave, 300000);
    await writeGroupSettings(groupSettings);
    return true;
  } catch {
    return false;
  }
}
