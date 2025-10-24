import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

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
    await sendMessageComplete(api, message, `Hướng dẫn game nối từ. 🎮\n${prefix}noitu join -> Tham gia trò chơi nối từ với Bot.\n${prefix}noitu leave -> Rời khỏi trò chơi nối từ.`);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (getActiveGames().has(threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        game.players.delete(message.data.uidFrom);
        if (game.players.size === 0) {
          getActiveGames().delete(threadId);
          await sendMessageComplete(api, message, "🚫 Trò chơi nối từ đã được hủy bỏ do không còn người chơi.");
        } else {
          await sendMessageComplete(api, message, "👋 Bạn đã rời khỏi trò chơi nối từ.");
        }
      } else {
        await sendMessageWarning(api, message, "⚠️ Bạn chưa tham gia trò chơi nối từ nào trong nhóm này.");
      }
    } else {
      await sendMessageWarning(api, message, "⚠️ Không có trò chơi nối từ nào đang diễn ra để rời khỏi.");
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    if (await checkHasActiveGame(api, message, threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        await sendMessageWarning(api, message, "⚠️ Bạn đã tham gia trò chơi nối từ rồi.");
      } else {
        game.players.add(message.data.uidFrom);
        game.incorrectAttempts.set(message.data.uidFrom, 0);
        await sendMessageComplete(api, message, "✅ Bạn đã tham gia trò chơi nối từ.");
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
    await sendMessageComplete(api, message, "🎮 Trò chơi nối từ bắt đầu! Hãy nhập một cụm từ (tối đa 2 từ) để bắt đầu.");
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
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua! Cụm từ của bạn "${cleanContentTrim}" phải có đúng ${game.maxWords} từ.`);
      activeGames.delete(threadId);
    } else {
      await sendMessageWarning(api, message, `Từ "${cleanContentTrim}" không hợp lệ (phải có đúng ${game.maxWords} từ).\nBạn còn ${2 - attempts} lần trước khi bị sút ra khỏi phòng!`);
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
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển hoặc sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}".`;
      
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua! ${reason} (2 lần sai)`);
      activeGames.delete(threadId);
    } else {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển hoặc sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}".`;
      
      await sendMessageWarning(api, message, `${reason}\nBạn còn 1 lần trước khi bị sút ra khỏi phòng!`);
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
      await sendMessageComplete(api, message, `🤖 Bot: ${botPhrase}\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`);
      game.botTurn = false;
    } else {
      let botReason = "";
      if (!isBotPhraseValid) botReason = `từ "${botPhrase}" của bot không hợp lệ`;
      else if (!isBotChainValid) botReason = `từ "${botPhrase}" của bot không bắt đầu bằng "${lastWordOfUserPhrase}"`;

      await sendMessageComplete(api, message, `🎉 Bot không tìm được cụm từ phù hợp hoặc ${botReason}.\nBot thua, bạn thắng!`);
      activeGames.delete(threadId);
    }
  } else {
    await sendMessageComplete(api, message, "🎉 Bot không tìm được cụm từ phù hợp. Bạn thắng!");
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
