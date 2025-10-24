import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";

async function checkWordValidity(word) {
  try {
    const encodedWord = encodeURIComponent(word);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    return response.data.success;
  } catch (error) {
    console.error("🚫 Lỗi khi kiểm tra từ với API nối từ:", error.message);
    return false;
  }
}

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();

  if (args[0]?.toLowerCase() === `${prefix}noitu` && !args[1]) {
    await sendMessageCompleteRequest(api, message, {
      caption: `Hướng dẫn game nối từ. 🎮\n${prefix}noitu join -> Tham gia trò chơi nối từ với Bot.\n${prefix}noitu leave -> Rời khỏi trò chơi nối từ.`,
    }, 180000);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (getActiveGames().has(threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        game.players.delete(message.data.uidFrom);
        if (game.players.size === 0) {
          getActiveGames().delete(threadId);
          await sendMessageCompleteRequest(api, message, {
            caption: "🚫 Trò chơi nối từ đã được hủy bỏ do không còn người chơi.",
          }, 180000);
        } else {
          await sendMessageCompleteRequest(api, message, {
            caption: "👋 Bạn đã rời khỏi trò chơi nối từ.",
          }, 180000);
        }
      } else {
        await sendMessageWarningRequest(api, message, {
          caption: "⚠️ Bạn chưa tham gia trò chơi nối từ nào trong nhóm này.",
        }, 180000);
      }
    } else {
      await sendMessageWarningRequest(api, message, {
        caption: "⚠️ Không có trò chơi nối từ nào đang diễn ra để rời khỏi.",
      }, 180000);
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    if (await checkHasActiveGame(api, message, threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        await sendMessageWarningRequest(api, message, {
          caption: "⚠️ Bạn đã tham gia trò chơi nối từ rồi.",
        }, 180000);
      } else {
        game.players.add(message.data.uidFrom);
        game.incorrectAttempts.set(message.data.uidFrom, 0);
        await sendMessageCompleteRequest(api, message, {
          caption: "✅ Bạn đã tham gia trò chơi nối từ.",
        }, 180000);
      }
      return;
    }

    getActiveGames().set(threadId, {
      type: 'wordChain',
      game: {
        lastPhrase: "",
        players: new Set([message.data.uidFrom]),
        botTurn: false,
        maxWords: 2,
        incorrectAttempts: new Map([[message.data.uidFrom, 0]]),
      }
    });
    await sendMessageCompleteRequest(api, message, {
      caption: "🎮 Trò chơi nối từ bắt đầu! Hãy nhập một cụm từ (tối đa 2 từ) để bắt đầu.",
    }, 180000);
    return;
  }
}

export async function handleWordChainMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'wordChain') return;

  const game = activeGames.get(threadId).game;
  const cleanContent = message.data.content.trim().toLowerCase();
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").trim();

  if (cleanContent !== cleanContentTrim) return;
  if (cleanContent.startsWith(prefix)) return;
  if (!game.players.has(senderId)) return;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length !== game.maxWords) {
    let attempts = game.incorrectAttempts.get(senderId) + 1;
    game.incorrectAttempts.set(senderId, attempts);

    if (attempts >= 2) {
      await sendMessageCompleteRequest(api, message, {
        caption: `🚫 ${message.data.dName} đã thua! Cụm từ của bạn "${cleanContentTrim}" phải có đúng ${game.maxWords} từ.`,
      }, 180000);
      activeGames.delete(threadId);
    }
    return;
  }

  let isWordValid = await checkWordValidity(cleanContentTrim);
  let isChainValid = true;

  if (game.lastPhrase !== "") {
    const lastWordOfPreviousPhrase = game.lastPhrase.split(/\s+/).pop();
    if (!cleanContentTrim.startsWith(lastWordOfPreviousPhrase)) {
      isChainValid = false;
    }
  }

  if (!isWordValid || !isChainValid) {
    let attempts = game.incorrectAttempts.get(senderId) + 1;
    game.incorrectAttempts.set(senderId, attempts);

    if (attempts >= 2) {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có nghĩa hoặc không hợp lệ.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}".`;
      
      await sendMessageCompleteRequest(api, message, {
        caption: `🚫 ${message.data.dName} đã thua! ${reason} (2 lần sai)`,
      }, 180000);
      activeGames.delete(threadId);
    }
    return;
  }

  game.lastPhrase = cleanContentTrim;
  game.incorrectAttempts.set(senderId, 0);
  game.botTurn = true;

  const botPhrase = await findNextPhrase(game.lastPhrase);
  if (botPhrase) {
    const isBotPhraseValid = await checkWordValidity(botPhrase);
    const lastWordOfUserPhrase = game.lastPhrase.split(/\s+/).pop();
    const isBotChainValid = botPhrase.startsWith(lastWordOfUserPhrase);

    if (isBotPhraseValid && isBotChainValid) {
      game.lastPhrase = botPhrase;
      await sendMessageCompleteRequest(api, message, {
        caption: `🤖 Bot: ${botPhrase}\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`,
      }, 180000);
      game.botTurn = false;
    } else {
      let botReason = "";
      if (!isBotPhraseValid) botReason = `từ "${botPhrase}" của bot không hợp lệ`;
      else if (!isBotChainValid) botReason = `từ "${botPhrase}" của bot không bắt đầu bằng "${lastWordOfUserPhrase}"`;

      await sendMessageCompleteRequest(api, message, {
        caption: `🎉 Bot không tìm được cụm từ phù hợp hoặc ${botReason}. Bot thua! Bạn thắng!`,
      }, 180000);
      activeGames.delete(threadId);
    }
  } else {
    await sendMessageCompleteRequest(api, message, {
      caption: "🎉 Bot không tìm được cụm từ phù hợp. Bạn thắng!",
    }, 180000);
    activeGames.delete(threadId);
  }
}

async function findNextPhrase(lastPhrase) {
  try {
    const encodedWord = encodeURIComponent(lastPhrase);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    if (response.data.success && response.data.nextWord && response.data.nextWord.text) {
      return response.data.nextWord.text;
    }
    return null;
  } catch (error) {
    console.error("🚫 Lỗi khi gọi API nối từ để tìm từ tiếp theo:", error.message);
    return null;
  }
}
