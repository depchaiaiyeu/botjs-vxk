import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageCompleteRequest } from "../../chat-zalo/chat-style/chat-style.js";

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");

  if (args[1]?.toLowerCase() === "cancel") {
    if (getActiveGames().has(threadId)) {
      getActiveGames().delete(threadId);
      await sendMessageCompleteRequest(api, message, {
        caption: "❌ Trò chơi nối từ đã được hủy bỏ.",
        ttl: 60000
      }, 180000);
    } else {
      await sendMessageCompleteRequest(api, message, {
        caption: "⚠️ Không có trò chơi nối từ nào đang diễn ra để hủy bỏ.",
        ttl: 60000
      }, 180000);
    }
    return;
  }

  if (await checkHasActiveGame(api, message, threadId)) return;

  getActiveGames().set(threadId, {
    type: 'wordChain',
    game: {
      lastPhrase: "",
      players: new Set(),
      botTurn: false,
      maxWords: 2
    }
  });

  await sendMessageCompleteRequest(api, message, {
    caption: "🎮 Trò chơi nối từ bắt đầu! Hãy nhập một cụm từ (tối đa 2 từ) để bắt đầu.",
    ttl: 60000
  }, 180000);
}

export async function handleWordChainMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'wordChain') return;

  const game = activeGames.get(threadId).game;
  const cleanContent = message.data.content.trim().toLowerCase();
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (cleanContent !== cleanContentTrim) return;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length > game.maxWords) {
    await sendMessageCompleteRequest(api, message, {
      caption: `❌ Bạn đã thua! Cụm từ của bạn vượt quá ${game.maxWords} từ cho phép.`,
      ttl: 60000
    }, 180000);
    activeGames.delete(threadId);
    return;
  }

  if (!game.botTurn) {
    if (game.lastPhrase === "" || cleanContentTrim.startsWith(game.lastPhrase.split(/\s+/).pop())) {
      game.lastPhrase = cleanContentTrim;
      game.players.add(message.data.uidFrom);
      game.botTurn = true;

      const botPhrase = await findNextPhrase(game.lastPhrase);
      if (botPhrase) {
        game.lastPhrase = botPhrase;
        await sendMessageCompleteRequest(api, message, {
          caption: `🤖 Bot: ${botPhrase}\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`,
          ttl: 60000
        }, 180000);
        game.botTurn = false;
      } else {
        await sendMessageCompleteRequest(api, message, {
          caption: "🎉 Bot không tìm được cụm từ phù hợp. Bạn thắng!",
          ttl: 60000
        }, 180000);
        activeGames.delete(threadId);
      }
    } else {
      await sendMessageCompleteRequest(api, message, {
        caption: `⚠️ Cụm từ không hợp lệ! Cụm từ phải bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}"`,
        ttl: 60000
      }, 180000);
    }
  } else {
    game.botTurn = false;
  }

  if (game.players.size >= 10) {
    await sendMessageCompleteRequest(api, message, {
      caption: "🏁 Trò chơi kết thúc! Cảm ơn mọi người đã tham gia.",
      ttl: 60000
    }, 180000);
    activeGames.delete(threadId);
  }
}

async function findNextPhrase(lastPhrase) {
  try {
    const encodedWord = encodeURIComponent(lastPhrase);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    if (response.data.success) {
      return response.data.nextWord.text;
    }
    return null;
  } catch (error) {
    console.error("❌ Lỗi khi gọi API nối từ:", error.message);
    return null;
  }
}
