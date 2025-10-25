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
    console.error("Lỗi khi kiểm tra từ với API nối từ:", error.message);
    return false;
  }
}

async function getInitialWord() {
  try {
    const response = await axios.get(`https://noitu.pro/init`);
    if (response.data && !response.data.error && response.data.chuan) {
      return response.data.chuan;
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi lấy từ khởi tạo:", error.message);
    return null;
  }
}

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();

  if (args[0]?.toLowerCase() === `${prefix}noitu` && !args[1]) {
    await sendMessageComplete(api, message, `🎮 Hướng dẫn game nối từ:\n🔗 ${prefix}noitu join: tham gia trò chơi nối từ với Bot.\n🔖 ${prefix}noitu leave: rời khỏi trò chơi nối từ.`);
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
          await sendMessageComplete(api, message, "Bạn đã rời khỏi trò chơi nối từ.");
        }
      } else {
        await sendMessageWarning(api, message, "Bạn chưa tham gia trò chơi nối từ nào trong nhóm này.");
      }
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi nối từ nào đang diễn ra để rời khỏi.");
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    if (await checkHasActiveGame(api, message, threadId)) {
      const game = getActiveGames().get(threadId).game;
      if (game.players.has(message.data.uidFrom)) {
        await sendMessageWarning(api, message, "Bạn đã tham gia trò chơi nối từ rồi.");
      } else {
        game.players.add(message.data.uidFrom);
        game.incorrectAttempts.set(message.data.uidFrom, 0);
        await sendMessageComplete(api, message, "Bạn đã tham gia trò chơi nối từ.");
      }
      return;
    }

    const initialWord = await getInitialWord();
    if (!initialWord) {
      await sendMessageWarning(api, message, "❌ Không thể khởi tạo trò chơi. Vui lòng thử lại sau.");
      return;
    }

    getActiveGames().set(threadId, {
      type: 'wordChain',
      game: {
        lastPhrase: initialWord,
        players: new Set([message.data.uidFrom]),
        botTurn: false,
        maxWords: 2,
        incorrectAttempts: new Map([[message.data.uidFrom, 0]]),
        lastProcessedMessage: ""
      }
    });

    const lastWord = initialWord.split(/\s+/).pop();
    await sendMessageComplete(api, message, `🎮 Trò chơi nối từ bắt đầu!\n\n🤖 Bot: ${initialWord}\n\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${lastWord}"`);
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

  if (game.lastProcessedMessage === cleanContentTrim) return;
  game.lastProcessedMessage = cleanContentTrim;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length !== game.maxWords) {
    if (!game.incorrectAttempts.has(senderId)) {
      game.incorrectAttempts.set(senderId, 0);
    }
    let attempts = game.incorrectAttempts.get(senderId) + 1;
    game.incorrectAttempts.set(senderId, attempts);

    if (attempts >= 2) {
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua!\nLý do: Cụm từ của bạn "${cleanContentTrim}" phải có đúng ${game.maxWords} từ.`);
      activeGames.delete(threadId);
    } else {
      await sendMessageWarning(api, message, `Từ "${cleanContentTrim}" không hợp lệ (phải có đúng ${game.maxWords} từ).\nBạn còn ${2 - attempts} lần đoán sai trước khi bị loại!`);
    }
    return;
  }

  if (!game.incorrectAttempts.has(senderId)) {
    game.incorrectAttempts.set(senderId, 0);
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
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển -> sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}".`;
      
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua!\n${reason} (2 lần sai)`);
      activeGames.delete(threadId);
    } else {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển hoặc sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}".`;
      
      await sendMessageWarning(api, message, `${reason}\nBạn còn 1 lần đoán sai trước khi bị loại!`);
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
      game.lastProcessedMessage = "";
      await sendMessageComplete(api, message, `🤖 Bot: ${botPhrase}\n\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`);
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
    console.error("Lỗi khi gọi API nối từ để tìm từ tiếp theo:", error.message);
    return null;
  }
}
