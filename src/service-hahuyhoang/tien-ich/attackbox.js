import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    sendMessageStateQuote,
    sendMessageFromSQL,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { getBotId } from "../../index.js";

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildHiddenMentions(line, memberIds, hiddenChar = " ") {
    let mentionPos = line.length;
    const customHiddenText = hiddenChar.repeat(memberIds.length);
    const mentions = memberIds.map(() => {
        const mention = {
            uid: "",
            pos: mentionPos,
            len: 1
        };
        mentionPos++;
        return mention;
    });
    memberIds.forEach((id, idx) => {
        mentions[idx].uid = id;
    });

    return { finalMessage: line + customHiddenText, mentions };
}

export async function handleAttackboxCommand(api, message) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);
    let args = content.split(" ");
    if (args.length < 3) {
        await sendMessageFromSQL(api, message, {
            success: false,
            message: `Cú pháp:\n${prefix}attackbox [link_nhóm] [số lần xin vào nhóm]\nVí dụ:\n${prefix}attackbox https://zalo.me/g/abcxyz 5`,
        }, false, 30000);
        return;
    }

    let linkJoin = args[1];
    let joinAttempts = parseInt(args[2]) || 10;

    if (!linkJoin) {
        await sendMessageFromSQL(api, message, {
            success: false,
            message: `Cú pháp không hợp lệ. Vui lòng kiểm tra lại lệnh!`,
        }, false, 30000);
        return;
    }

    const varFilePath = path.join(__dirname, "data", "var.txt");
    let spamLines = [];

    try {
        if (fs.existsSync(varFilePath)) {
            spamLines = fs.readFileSync(varFilePath, "utf8")
                         .split("\n")
                         .map(line => line.trim())
                         .filter(line => line.length > 0);
        } else {
            return;
        }
    } catch (error) {
        return;
    }

    const botId = getBotId();

    while (joinAttempts > 0) {
        let threadId = null;
        let memberIds = [];
        let botInGroup = false;
        let stopSpam = false;

        try {
            await api.joinGroup(linkJoin);
        } catch (error) {
            if (!error.message.includes("Waiting for approve")) {
                joinAttempts--;
                continue;
            }
        }

        try {
            let groupInfo = await api.getGroupInfoByLink(linkJoin);
            if (!groupInfo || !groupInfo.groupId) {
                joinAttempts--;
                continue;
            }
            threadId = groupInfo.groupId;
            memberIds = groupInfo.currentMems.map(member => member.id);
        } catch (error) {
            joinAttempts--;
            continue;
        }

        let botCheckLoop = async () => {
            while (!botInGroup) {
                try {
                    let groupInfo = await api.getGroupInfoByLink(linkJoin);
                    let currentMembers = groupInfo.currentMems.map(member => member.id);

                    if (currentMembers.includes(botId)) {
                        botInGroup = true;
                        await api.leaveGroup([threadId], false);
                        return;
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 5));
                    }
                } catch (error) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
        };

        let sendMessagesLoop = async () => {
            if (stopSpam) return;

            if (memberIds.length > 0 && spamLines.length > 0) {
                try {
                    for (let line of spamLines) {
                        if (stopSpam) return;

                        let { finalMessage, mentions } = buildHiddenMentions(line, memberIds, " ");
                        await api.sendMessage({
                            msg: finalMessage,
                            mentions: mentions,
                        }, threadId, message.type);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (error) {
                    if (error.message.includes("Cannot read properties of undefined (reading 'name')")) {
                        stopSpam = true;
                    }
                    return;
                }
            }
        };

        await Promise.race([botCheckLoop(), sendMessagesLoop()]);
        joinAttempts--;
    }
}
