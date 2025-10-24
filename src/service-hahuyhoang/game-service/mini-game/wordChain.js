import axios from "axios";
import { getActiveGames } from "./index.js";
import { sendMessageComplete, sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../chat-zalo/chat-style/chat-style.js";

const TURN_TIMEOUT = 30000;

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const action = args[1]?.toLowerCase();
  const userId = message.data.uidFrom;
  const activeGames = getActiveGames();

  if (action === "join") {
    if (!activeGames.has(threadId)) {
      activeGames.set(threadId, {
        type: "wordChain",
        game: {
          lastPhrase: "",
          players: new Set([userId]),
          botTurn: false,
          maxWords: 2,
          userFails: new Map(),
          currentPlayer: userId,
          timeoutId: null,
          started: false
        }
      });
      await sendMessageFromSQL(api, message, { caption: "Phòng nối từ đã được tạo. Hãy nhập 2 từ để bắt đầu trò chơi." }, 180000);
      startTurnTimer(api, message, threadId);
    } else {
      const game = activeGames.get(threadId).game;
      if (game.players.has(userId)) {
        await sendMessageQuery(api, message, { caption: "Bạn đã tham gia trò chơi này rồi." }, 180000);
      } else {
        game.players.add(userId);
        await sendMessageComplete(api, message, { caption: "Bạn đã tham gia phòng nối từ." }, 180000);
      }
    }
    return;
  }

  if (action === "leave") {
    if (!activeGames.has(threadId)) {
      await sendMessageFailed(api, message, { caption: "Không có phòng nối từ nào để rời." }, 180000);
      return;
    }
    const game = activeGames.get(threadId).game;
    if (!game.players.has(userId)) {
      await sendMessageQuery(api, message, { caption: "Bạn chưa tham gia trò chơi này." }, 180000);
      return;
    }
    game.players.delete(userId);
    await sendMessageComplete(api, message, { caption: "Bạn đã rời khỏi trò chơi nối từ." }, 180000);
    if (game.players.size === 0) {
      clearTimeout(game.timeoutId);
      activeGames.delete(threadId);
      await sendMessageFromSQL(api, message, { caption: "Không còn người chơi nào, trò chơi kết thúc." }, 180000);
    }
    return;
  }
}

export async function handleWordChainMessage(api, message) {
  const threadId = message.threadId;
  const userId = message.data.uidFrom;
  const activeGames = getActiveGames();

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== "wordChain") return;

  const game = activeGames.get(threadId).game;
  if (userId !== game.currentPlayer) return;

  const cleanContent = message.data.content.trim().toLowerCase();
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (cleanContent !== cleanContentTrim) return;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length !== 2) return; // chỉ chấp nhận đúng 2 từ

  clearTimeout(game.timeoutId);

  const validUserWord = await validateWord(cleanContentTrim);
  if (!validUserWord) {
    const fails = (game.userFails.get(userId) || 0) + 1;
    game.userFails.set(userId, fails);
    if (fails >= 2) {
      await sendMessageFailed(api, message, { caption: "Bạn đã nhập từ sai 2 lần. Bạn thua!" }, 180000);
      getActiveGames().delete(threadId);
      return;
    } else {
      await sendMessageQuery(api, message, { caption: `Cụm từ "${cleanContentTrim}" không hợp lệ. (Lần ${fails}/2)` }, 180000);
      startTurnTimer(api, message, threadId);
      return;
    }
  }

  if (!game.started) game.started = true;
  game.lastPhrase = cleanContentTrim;
  game.botTurn = true;

  const botPhrase = await findNextPhrase(cleanContentTrim);
  if (botPhrase) {
    const validBotWord = await validateWord(botPhrase);
    if (!validBotWord) {
      await sendMessageComplete(api, message, { caption: "Bot không tìm được cụm từ phù hợp. Bạn thắng!" }, 180000);
      getActiveGames().delete(threadId);
      return;
    }
    game.lastPhrase = botPhrase;
    await sendMessageFromSQL(api, message, { caption: `Bot: ${botPhrase}\nCụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"` }, 180000);
    game.botTurn = false;
    startTurnTimer(api, message, threadId);
  } else {
    await sendMessageComplete(api, message, { caption: "Bot không tìm được cụm từ phù hợp. Bạn thắng!" }, 180000);
    getActiveGames().delete(threadId);
  }
}

function startTurnTimer(api, message, threadId) {
  const activeGames = getActiveGames();
  const gameData = activeGames.get(threadId);
  if (!gameData) return;
  clearTimeout(gameData.game.timeoutId);
  gameData.game.timeoutId = setTimeout(async () => {
    await sendMessageFailed(api, message, { caption: "Hết thời gian 30 giây! Bạn đã thua lượt này." }, 180000);
    activeGames.delete(threadId);
  }, TURN_TIMEOUT);
}

async function findNextPhrase(lastPhrase) {
  try {
    const encodedWord = encodeURIComponent(lastPhrase);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    if (response.data.success) return response.data.nextWord.text;
    return null;
  } catch {
    return null;
  }
}

async function validateWord(word) {
  try {
    const encodedWord = encodeURIComponent(word);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    return response.data.success;
  } catch {
    return false;
  }
}
