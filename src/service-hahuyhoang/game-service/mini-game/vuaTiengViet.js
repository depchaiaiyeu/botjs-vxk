import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

function shuffleWord(word) {
  const chars = word.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join(' | ');
}

function normalizeText(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function hasSpecialCharacters(text) {
  return /[^\p{L}\p{N}\s]/u.test(text);
}

async function getInitWord() {
  try {
    const response = await axios.get('https://noitu.pro/init');
    if (!response.data.error && response.data.chuan) {
      return response.data.chuan;
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi lấy từ khởi tạo:", error.message);
    return null;
  }
}

async function checkAnswer(word) {
  try {
    const encodedWord = encodeURIComponent(word);
    const response = await axios.get(`https://noitu.pro/answervtv?word=${encodedWord}`);
    if (!response.data.error && response.data.success) {
      return {
        success: true,
        nextWord: response.data.nextWord?.chuan || null,
        win: response.data.win
      };
    }
    return { success: false };
  } catch (error) {
    console.error("Lỗi khi kiểm tra đáp án:", error.message);
    return { success: false };
  }
}

function startTimeout(api, message, threadId, game) {
  if (game.timeoutId) {
    clearTimeout(game.timeoutId);
  }
  
  game.timeoutId = setTimeout(async () => {
    const activeGames = getActiveGames();
    if (activeGames.has(threadId)) {
      await sendMessageComplete(api, message, `🚫 Hết thời gian! Bạn đã thua!\n\nĐáp án đúng là: ${game.currentWord}`);
      activeGames.delete(threadId);
    }
  }, 30000);
}

export async function handleVuaTiengVietCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();

  if (args[0]?.toLowerCase() === `${prefix}vuatiengviet` && !args[1]) {
    await sendMessageComplete(api, message, `🎮 Hướng dẫn game Vua Tiếng Việt:\n${prefix}vuatiengviet join -> Tham gia trò chơi xáo trộn từ\n${prefix}vuatiengviet leave -> Rời khỏi trò chơi`);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (getActiveGames().has(threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        if (game.timeoutId) {
          clearTimeout(game.timeoutId);
        }
        game.players.delete(message.data.uidFrom);
        if (game.players.size === 0) {
          getActiveGames().delete(threadId);
          await sendMessageComplete(api, message, "🚫 Trò chơi đã được hủy bỏ do không còn người chơi.");
        } else {
          await sendMessageComplete(api, message, "Bạn đã rời khỏi trò chơi.");
        }
      } else {
        await sendMessageWarning(api, message, "Bạn chưa tham gia trò chơi nào trong nhóm này.");
      }
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi nào đang diễn ra.");
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    if (await checkHasActiveGame(api, message, threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        await sendMessageWarning(api, message, "Bạn đã tham gia trò chơi rồi.");
      } else {
        game.players.add(message.data.uidFrom);
        await sendMessageComplete(api, message, "Bạn đã tham gia trò chơi.");
      }
      return;
    }

    const initWord = await getInitWord();
    if (!initWord) {
      await sendMessageWarning(api, message, "🚫 Không thể khởi tạo trò chơi. Vui lòng thử lại sau.");
      return;
    }

    const shuffled = shuffleWord(initWord);
    
    const game = {
      currentWord: initWord,
      shuffledWord: shuffled,
      players: new Set([message.data.uidFrom]),
      timeoutId: null
    };
    
    getActiveGames().set(threadId, {
      type: 'vuaTiengViet',
      game: game
    });
    
    startTimeout(api, message, threadId, game);
    
    await sendMessageComplete(api, message, `🎮 Trò chơi Vua Tiếng Việt bắt đầu!\n\n🤖 Từ Bot ra là: ${shuffled}\n\nHãy đoán xem từ gốc là gì??? 🤔`);
    return;
  }
}

export async function handleVuaTiengVietMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'vuaTiengViet') return;

  const game = activeGames.get(threadId).game;
  const cleanContent = message.data.content.trim();

  if (cleanContent.startsWith(prefix)) return;
  if (!game.players.has(senderId)) return;
  if (hasSpecialCharacters(cleanContent)) return;

  const words = cleanContent.split(/\s+/);
  if (words.length !== 2) return;

  const userAnswer = normalizeText(cleanContent);
  const correctAnswer = normalizeText(game.currentWord);

  if (userAnswer !== correctAnswer) {
    if (game.timeoutId) {
      clearTimeout(game.timeoutId);
    }
    await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua!\n\nĐáp án đúng là: ${game.currentWord}\nLý do: Trả lời sai.`);
    activeGames.delete(threadId);
    return;
  }

  if (game.timeoutId) {
    clearTimeout(game.timeoutId);
  }

  const result = await checkAnswer(game.currentWord);
  
  if (!result.success) {
    await sendMessageComplete(api, message, `✅ Bạn đã đoán đúng!\n\nĐáp án: ${game.currentWord}\n\n🚫 Không thể tiếp tục trò chơi. Bạn thắng!`);
    activeGames.delete(threadId);
    return;
  }

  if (result.win) {
    await sendMessageComplete(api, message, `✅ Bạn đã đoán đúng!\n\nĐáp án: ${game.currentWord}\n\nChúc mừng! Bạn đã hoàn thành và trở thành Vua Tiếng Việt!`);
    activeGames.delete(threadId);
    return;
  }

  if (!result.nextWord) {
    await sendMessageComplete(api, message, `✅ Bạn đã đoán đúng!\n\nĐáp án: ${game.currentWord}\n\n🚫 Không có từ tiếp theo. Bạn thắng!`);
    activeGames.delete(threadId);
    return;
  }

  game.currentWord = result.nextWord;
  game.shuffledWord = shuffleWord(result.nextWord);

  startTimeout(api, message, threadId, game);

  await sendMessageComplete(api, message, `✅ Bạn đã đoán đúng!\n\n🤖 Từ tiếp theo Bot ra là: ${game.shuffledWord}\n\n🤔 Hãy đoán xem từ gốc là gì???`);
}
