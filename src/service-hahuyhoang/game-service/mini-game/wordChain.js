import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageFailed, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";

const USER_TIMEOUT = 30000;
const MAX_WRONG_ATTEMPTS = 2;

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const command = args[1]?.toLowerCase();

  if (command === "join") {
    if (await checkHasActiveGame(api, message, threadId)) return;

    getActiveGames().set(threadId, {
      type: 'wordChain',
      game: {
        lastPhrase: "",
        players: new Map(),
        currentPlayerId: null,
        turnStartTime: null,
        wrongAttempts: new Map(),
        botTurn: false,
        maxWords: 2,
        waitingForFirstWord: true
      }
    });

    await sendMessageComplete(api, message, "🎮 Phòng chơi nối từ đã mở! Người chơi đầu tiên hãy nhập 2 từ để bắt đầu.", true);
    return;
  }

  if (command === "leave") {
    const activeGames = getActiveGames();
    if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'wordChain') {
      await sendMessageWarning(api, message, "⚠️ Không có phòng chơi nối từ nào đang mở.", true);
      return;
    }

    const game = activeGames.get(threadId).game;
    const userId = message.data.uidFrom;

    if (game.players.has(userId)) {
      game.players.delete(userId);
      await sendMessageComplete(api, message, "👋 Bạn đã rời khỏi phòng chơi nối từ.", true);
      
      if (game.players.size === 0) {
        activeGames.delete(threadId);
        await sendMessageComplete(api, message, "🏁 Phòng chơi đã đóng vì không còn người chơi nào.", true);
      }
    } else {
      await sendMessageWarning(api, message, "⚠️ Bạn chưa tham gia phòng chơi này.", true);
    }
    return;
  }
}

export async function handleWordChainMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'wordChain') return;

  const game = activeGames.get(threadId).game;
  const userId = message.data.uidFrom;
  const cleanContent = message.data.content.trim();
  
  const prefix = await getGlobalPrefix();
  if (cleanContent.startsWith(prefix) || cleanContent.includes(prefix)) return;

  const cleanContentLower = cleanContent.toLowerCase();
  const cleanContentTrim = cleanContentLower.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (cleanContentLower !== cleanContentTrim) return;

  const words = cleanContentTrim.split(/\s+/);
  
  if (words.length !== 2) return;

  if (!game.players.has(userId)) {
    game.players.set(userId, { name: message.data.dName });
  }

  if (game.waitingForFirstWord) {
    const apiResponse = await validateWord(cleanContentTrim);
    if (!apiResponse.success) {
      await sendMessageFailed(api, message, "❌ Từ không hợp lệ! Vui lòng nhập 2 từ khác để bắt đầu.", true);
      return;
    }

    game.lastPhrase = cleanContentTrim;
    game.waitingForFirstWord = false;
    game.currentPlayerId = userId;
    game.turnStartTime = Date.now();

    await sendMessageComplete(api, message, `✅ Trò chơi bắt đầu với từ: "${cleanContentTrim}"\n👉 Từ tiếp theo phải bắt đầu bằng "${words[words.length - 1]}"`, true);
    
    setTimeout(() => checkTimeout(api, threadId, userId), USER_TIMEOUT);
    return;
  }

  if (game.botTurn || userId === game.currentPlayerId) return;

  const lastWord = game.lastPhrase.split(/\s+/).pop();
  if (!cleanContentTrim.startsWith(lastWord)) {
    await handleWrongAttempt(api, message, threadId, userId, `⚠️ Từ không hợp lệ! Từ phải bắt đầu bằng "${lastWord}"`);
    return;
  }

  const apiResponse = await validateWord(cleanContentTrim);
  if (!apiResponse.success) {
    await handleWrongAttempt(api, message, threadId, userId, "❌ Từ không có nghĩa hoặc không hợp lệ!");
    return;
  }

  game.wrongAttempts.set(userId, 0);
  game.lastPhrase = cleanContentTrim;
  game.currentPlayerId = null;
  game.botTurn = true;

  const botPhrase = await findNextPhrase(game.lastPhrase);
  
  if (!botPhrase) {
    const playersList = Array.from(game.players.entries()).map(([id, data]) => ({
      name: data.name,
      uid: id
    }));
    
    const mentions = playersList.map((player, index) => ({
      pos: "🎉 Chúc mừng các người chơi:\n".length + playersList.slice(0, index).reduce((sum, p) => sum + p.name.length + 2, 0),
      uid: player.uid,
      len: player.name.length
    }));

    await sendMessageTag(api, message, {
      caption: `🎉 Chúc mừng các người chơi:\n${playersList.map(p => p.name).join(", ")}\nBot không tìm được từ phù hợp. Các bạn thắng!`,
      mentions: mentions
    }, 60000);
    
    activeGames.delete(threadId);
    return;
  }

  const botValidation = await validateWord(botPhrase);
  if (!botValidation.success) {
    const playersList = Array.from(game.players.entries()).map(([id, data]) => ({
      name: data.name,
      uid: id
    }));
    
    const mentions = playersList.map((player, index) => ({
      pos: "🎉 Chúc mừng các người chơi:\n".length + playersList.slice(0, index).reduce((sum, p) => sum + p.name.length + 2, 0),
      uid: player.uid,
      len: player.name.length
    }));

    await sendMessageTag(api, message, {
      caption: `🎉 Chúc mừng các người chơi:\n${playersList.map(p => p.name).join(", ")}\nBot đưa ra từ không hợp lệ. Các bạn thắng!`,
      mentions: mentions
    }, 60000);
    
    activeGames.delete(threadId);
    return;
  }

  game.lastPhrase = botPhrase;
  game.botTurn = false;
  game.currentPlayerId = userId;
  game.turnStartTime = Date.now();

  const nextWord = botPhrase.split(/\s+/).pop();
  await sendMessageComplete(api, message, `🤖 Bot: ${botPhrase}\n👉 Từ tiếp theo phải bắt đầu bằng "${nextWord}"`, true);

  setTimeout(() => checkTimeout(api, threadId, userId), USER_TIMEOUT);
}

async function handleWrongAttempt(api, message, threadId, userId, errorMsg) {
  const game = getActiveGames().get(threadId).game;
  const currentAttempts = (game.wrongAttempts.get(userId) || 0) + 1;
  game.wrongAttempts.set(userId, currentAttempts);

  if (currentAttempts >= MAX_WRONG_ATTEMPTS) {
    await sendMessageFailed(api, message, `${errorMsg}\n💀 Bạn đã sai ${MAX_WRONG_ATTEMPTS} lần và bị loại!`, true);
    
    game.players.delete(userId);
    
    if (game.players.size === 0) {
      getActiveGames().delete(threadId);
      await sendMessageComplete(api, message, "🏁 Trò chơi kết thúc vì không còn người chơi nào.", true);
    }
  } else {
    await sendMessageWarning(api, message, `${errorMsg}\n⚠️ Cảnh báo: ${currentAttempts}/${MAX_WRONG_ATTEMPTS} lần sai.`, true);
  }
}

async function checkTimeout(api, threadId, userId) {
  const activeGames = getActiveGames();
  if (!activeGames.has(threadId)) return;

  const game = activeGames.get(threadId).game;
  if (game.currentPlayerId !== userId || game.botTurn) return;

  const elapsed = Date.now() - game.turnStartTime;
  if (elapsed >= USER_TIMEOUT) {
    game.players.delete(userId);
    
    const playerData = game.players.get(userId);
    const playerName = playerData ? playerData.name : "Người chơi";
    
    await sendMessageFailed(api, { 
      threadId, 
      data: { uidFrom: userId, dName: playerName },
      type: 1
    }, `⏱️ ${playerName} đã hết thời gian (30s) và bị loại!`, true);

    if (game.players.size === 0) {
      activeGames.delete(threadId);
      await sendMessageComplete(api, { 
        threadId, 
        data: { uidFrom: userId, dName: playerName },
        type: 1
      }, "🏁 Trò chơi kết thúc vì không còn người chơi nào.", true);
    } else {
      game.currentPlayerId = null;
      game.botTurn = false;
    }
  }
}

async function validateWord(phrase) {
  try {
    const encodedWord = encodeURIComponent(phrase);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    return {
      success: response.data.success === true
    };
  } catch (error) {
    console.error("❌ Lỗi khi validate từ:", error.message);
    return { success: false };
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
