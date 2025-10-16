import { MessageType } from "zlbotdqt";
import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getBotId } from "../../../index.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest } from "../../chat-zalo/chat-style/chat-style.js";

const geminiApiKey = "AIzaSyBjp8dgOzzURBynbl5RtduaA5HBnDc95f4";
const activeGames = new Map();

function safeName(name) {
  return name || "Người chơi";
}

export async function handleNoitu(api, message, aliasCommand, isCommand = false) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = safeName(message.data?.dName || message.data?.senderName);
  const content = removeMention(message).trim().toLowerCase();

  if (isCommand) {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "start") {
      if (activeGames.has(threadId)) {
        const res = await sendMessageCompleteRequest(api, message, {
          caption: "❗ Trò chơi đang diễn ra.",
          ttl: 60000
        }, 180000);
        console.log("[BOT CẢNH BÁO - ĐANG DIỄN RA]:", res);
        return;
      }

      const game = {
        status: "register",
        players: [{ id: senderId, name: senderName }],
        currentTurn: 0,
        lastPhrase: "",
        maxWords: 2,
        timeout: null,
        lastBotMsgId: null
      };

      activeGames.set(threadId, game);

      const resStart = await sendMessageCompleteRequest(api, message, {
        caption: `🎮 Trò chơi nối từ bắt đầu!\n⏳ Gõ ${prefix}${aliasCommand} dangky để tham gia (trong 30 giây).`,
        ttl: 60000
      }, 180000);
      console.log("[BOT BẮT ĐẦU GAME]:", resStart);

      setTimeout(async () => {
        const currentGame = activeGames.get(threadId);
        if (!currentGame || currentGame.status !== "register") return;

        currentGame.status = "playing";
        const botPhrase = await findNextPhrase("", 2);
        currentGame.lastPhrase = botPhrase;

        const list = currentGame.players.map((p, i) => `${i + 1}. ${safeName(p.name)}`).join("\n");

        const res = await sendMessageCompleteRequest(api, message, {
          caption: `📢 Danh sách người chơi:\n${list}\n🤖 Bot mở đầu: ${botPhrase}\n👉 Người chơi 1 (${safeName(currentGame.players[0].name)}), hãy reply vào tin nhắn này.`,
          ttl: 60000
        }, 180000);
        console.log("[BOT RA ĐỀ]:", res);

        currentGame.lastBotMsgId = res?.messageID || null;
        startTurnCountdown(api, threadId);
      }, 30000);
    }

    else if (subCommand === "dangky") {
      const game = activeGames.get(threadId);
      if (!game || game.status !== "register") return;

      const exists = game.players.some(p => p.id === senderId);
      const res = await sendMessageCompleteRequest(api, message, {
        caption: exists
          ? `⚠️ Bạn đã đăng ký rồi.`
          : `✅ ${senderName} đã đăng ký tham gia.`,
        ttl: 60000
      }, 180000);
      console.log("[BOT ĐĂNG KÝ]:", res);

      if (!exists) game.players.push({ id: senderId, name: senderName });
    }

    else {
      const res = await sendMessageCompleteRequest(api, message, {
        caption: `❓ Sai cú pháp. Dùng: ${prefix}${aliasCommand} start hoặc ${prefix}${aliasCommand} dangky`,
        ttl: 60000
      }, 180000);
      console.log("[BOT SAI CÚ PHÁP]:", res);
    }

    return;
  }

  const game = activeGames.get(threadId);
  if (!game || game.status !== "playing") return;

  const botId = getBotId();
  const replyUid = message.data?.quote?.uid;
  const replyMid = message.data?.quote?.mid;
  const lastMid = game.lastBotMsgId;
  const isReplyToBot = replyUid === botId || (replyMid && lastMid && replyMid === lastMid);
  if (!isReplyToBot) return;

  const currentPlayer = game.players[game.currentTurn];
  if (senderId !== currentPlayer.id) return;

  const clean = content.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const words = clean.split(/\s+/);

  if (words.length > game.maxWords) {
    const res = await sendMessageCompleteRequest(api, message, {
      caption: `❌ Cụm từ vượt quá ${game.maxWords} từ. ${senderName} bị loại.`,
      ttl: 60000
    }, 180000);
    console.log("[LOẠI VÌ VƯỢT TỪ]:", res);
    removeCurrentPlayer(api, message);
    return;
  }

  const lastWord = game.lastPhrase.split(" ").pop();
  if (game.lastPhrase === "" || clean.startsWith(lastWord)) {
    game.lastPhrase = clean;
    game.currentTurn++;

    if (game.currentTurn === game.players.length) {
      const botPhrase = await findNextPhrase(game.lastPhrase, game.maxWords);
      if (botPhrase) {
        game.lastPhrase = botPhrase;
        game.currentTurn = 0;

        const res = await sendMessageCompleteRequest(api, message, {
          caption: `🤖 Bot: ${botPhrase}\n👉 Đến lượt: ${safeName(game.players[0].name)} (hãy reply vào tin này)`,
          ttl: 60000
        }, 180000);
        console.log("[BOT NỐI TỪ]:", res);

        game.lastBotMsgId = res?.messageID || null;
        startTurnCountdown(api, threadId);
      } else {
        activeGames.delete(threadId);
        const res = await sendMessageCompleteRequest(api, message, {
          caption: "🎉 Bot không nghĩ ra từ nối. Các bạn đã chiến thắng!",
          ttl: 60000
        }, 180000);
        console.log("[GAME KẾT THÚC - BOT THUA]:", res);
      }
      return;
    }

    const next = game.players[game.currentTurn];
    const res = await sendMessageCompleteRequest(api, message, {
      caption: `👉 Đến lượt: ${safeName(next.name)} (hãy reply vào tin nhắn của bot!)`,
      ttl: 60000
    }, 180000);
    console.log("[ĐẾN LƯỢT NGƯỜI CHƠI]:", res);
    startTurnCountdown(api, threadId);
  } else {
    const res = await sendMessageCompleteRequest(api, message, {
      caption: `⚠️ Câu phải bắt đầu bằng từ: "${lastWord}"`,
      ttl: 60000
    }, 180000);
    console.log("[SAI TỪ BẮT ĐẦU]:", res);
  }
}

function startTurnCountdown(api, threadId) {
  const game = activeGames.get(threadId);
  if (!game || game.status !== "playing") return;

  clearTimeout(game.timeout);
  game.timeout = setTimeout(async () => {
    if (game.currentTurn === game.players.length) return;
    const loser = game.players[game.currentTurn];
    const res = await sendMessageCompleteRequest(api, { threadId }, {
      caption: `⏰ ${safeName(loser.name)} đã quá thời gian! Bị loại.`,
      ttl: 60000
    }, 180000);
    console.log("[LOẠI VÌ AFK]:", res);
    removeCurrentPlayer(api, { threadId });
  }, 60000);
}

function removeCurrentPlayer(api, message) {
  const threadId = message.threadId;
  const game = activeGames.get(threadId);
  if (!game) return;

  game.players.splice(game.currentTurn, 1);

  if (game.players.length === 0) {
    activeGames.delete(threadId);
    sendMessageCompleteRequest(api, message, {
      caption: "🏁 Tất cả người chơi đã bị loại. Trò chơi kết thúc!",
      ttl: 60000
    }, 180000).then(res => console.log("[GAME HUỶ - KHÔNG CÒN AI]:", res));
    return;
  }

  if (game.currentTurn >= game.players.length) game.currentTurn = 0;
  const next = game.players[game.currentTurn];
  sendMessageCompleteRequest(api, message, {
    caption: `👉 Đến lượt: ${safeName(next.name)} (hãy reply vào tin nhắn của bot!)`,
    ttl: 60000
  }, 180000).then(res => console.log("[LƯỢT MỚI - TIẾP THEO]:", res));
  startTurnCountdown(api, threadId);
}

async function findNextPhrase(LastPhrase) {
  try {
    const encodedWord = encodeURIComponent(LastPhrase);
    const response = await axios.get(
      `https://noitu.pro/answer?word=${encodedWord}`
    );

    if (response.data.success) {
      return response.data.nextWord.text;
    }

    return null;
  } catch (error) {
    console.error("Lỗi khi gọi API nối từ:", error);
    return null;
  }
}