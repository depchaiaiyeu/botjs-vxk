import schedule from "node-schedule";
import {
    sendMessageStateQuote,
    sendMessageFromSQL,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

export async function handlejointagCommand(api, message) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);
    let fullArgs = content.substring(content.indexOf(" ") + 1);

    if (!fullArgs) {
        await sendMessageFromSQL(api, message, {
            success: false,
            message: `Cú pháp:\n${prefix}attackbox [link_nhóm]_[nội_dung_nhắn]\nVí dụ:\n${prefix}attackbox[link_nhóm]`,
        }, false, 30000);
        return;
    }

    let [linkJoin, tagAllContent = "Duyệt bố vào nhóm"] = fullArgs.split('_');

    if (!linkJoin) {
        await sendMessageFromSQL(api, message, {
            success: false,
            message: `Cú pháp không hợp lệ. Vui lòng kiểm tra lại lệnh!`,
        }, false, 30000);
        return;
    }

    let groupInfo;
    let threadId;
    let adminIds = [];
    let originThreadId = message.threadId;

    try {
        groupInfo = await api.getGroupInfoByLink(linkJoin);
        if (!groupInfo || !groupInfo.groupId) throw new Error("Nhóm không tồn tại.");
        threadId = groupInfo.groupId;
        adminIds = [...groupInfo.adminIds, groupInfo.creatorId];
    } catch (error) {
        await sendMessageStateQuote(api, message, `❌ Link nhóm không hợp lệ hoặc không tồn tại!`, false, 10000, false, message.data.msgId);
        return;
    }

    try {
        await api.joinGroup(linkJoin);
        await new Promise(resolve => setTimeout(resolve, 5000));
        let checkGroupInfo = await api.getGroupInfo(threadId);
        if (checkGroupInfo && checkGroupInfo.groupId) {
            await sendMessageStateQuote(api, message, `✅ (@${senderName})\n Bot đã tham gia nhóm ${groupInfo.name} thành công!`, true, 30000);
            return;
        }
    } catch (error) {
        if (error.message.includes("Waiting for approve")) {
        } else {
            console.error("[ERROR] Lỗi khi tham gia nhóm:", error);
        }
    }
    if (adminIds.length > 0) {
        try {
            let mentionText = adminIds.map(id => `@${id}`).join(" ");
            let mentions = adminIds.map((id, index) => ({
                pos: mentionText.indexOf(`@${id}`),
                len: id.length + 1,
                uid: id
            }));

            await api.sendMessage({
                msg: `${mentionText} ${tagAllContent}`,
                mentions: mentions,
            }, threadId, message.type);
            await sendMessageStateQuote(api, message, `Bot đã gửi yêu cầu vào nhóm ${groupInfo.name}.`, true, 30000);
        } catch (error) {
            console.error("[ERROR] Lỗi khi gửi tin nhắn xin duyệt:", error);
        }
    }
}
