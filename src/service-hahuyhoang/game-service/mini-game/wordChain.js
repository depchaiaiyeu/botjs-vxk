import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

async function checkWordValidity(word) {
  try {
    const encodedWord = encodeURIComponent(word);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    return response.data;
  } catch (error) {
    console.error("Lỗi khi kiểm tra từ với API nối từ:", error.message);
    return { success: false };
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
  const content = message.data.content || "";
  const args = content.split(" ");
  const prefix = getGlobalPrefix();

  if (args[0]?.toLowerCase() === `${prefix}noitu` && !args[1]) {
    await sendMessageComplete(api, message, `🎮 Hướng dẫn game nối từ:\n🔗 ${prefix}noitu join: tham gia trò chơi nối từ với Bot.\n🔖 ${prefix}noitu leave: rời khỏi trò chơi nối từ.\n🔍 ${prefix}noitu tracuu [cụm từ]: tra cứu thông tin từ vựng.`);
    return;
  }

  if (args[1]?.toLowerCase() === "tracuu") {
    const phraseToCheck = args.slice(2).join(" ");
    const cleanPhrase = phraseToCheck.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

    if (phraseToCheck !== cleanPhrase || !cleanPhrase) {
      await sendMessageWarning(api, message, "Cụm từ không hợp lệ! Vui lòng chỉ nhập 2 từ không có ký tự đặc biệt.");
      return;
    }

    const words = cleanPhrase.split(/\s+/);
    if (words.length !== 2) {
      await sendMessageWarning(api, message, "Vui lòng nhập đúng 2 từ để tra cứu!");
      return;
    }

    const result = await checkWordValidity(cleanPhrase);
    if (result.success) {
      let responseMsg = `✅ Cụm từ "${cleanPhrase}" hợp lệ và có trong từ điển!`;
      if (result.nextWord && result.nextWord.text) {
        responseMsg += `\n🌟 Từ được Bot gợi ý là: ${result.nextWord.text}`;
      }
      await sendMessageComplete(api, message, responseMsg);
    } else {
      await sendMessageWarning(api, message, `🚫 Cụm từ "${cleanPhrase}" sai chính tả hoặc không có trong từ điển!`);
    }
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (getActiveGames().has(threadId)) {
      const gameData = getActiveGames().get(threadId);
      const game = gameData.game;
      
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
      const gameData = getActiveGames().get(threadId);
      const game = gameData.game;
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
      await sendMessageWarning(api, message, "🚫 Không thể khởi tạo trò chơi. Vui lòng thử lại sau.");
      return;
    }

    getActiveGames().set(threadId, {
      type: 'wordChain',
      game: {
        lastPhraseUser: "",
        lastPhraseBot: initialWord,
        players: new Set([message.data.uidFrom]),
        botTurn: false,
        maxWords: 2,
        incorrectAttempts: new Map([[message.data.uidFrom, 0]]),
        processingBot: false
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

  if (!activeGames.has(threadId)) return;

  const gameData = activeGames.get(threadId);

  if (gameData.type !== 'wordChain') return;

  const game = gameData.game;
  const content = message.data.content || "";
  const cleanContent = content.toLowerCase();
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

  if (cleanContent !== cleanContentTrim) return;
  if (cleanContent.startsWith(prefix)) return;
  if (!game.players.has(senderId)) return;
  if (game.processingBot) return;

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
  
  const result = await checkWordValidity(cleanContentTrim);
  const isWordValid = result.success;
  let isChainValid = true;

  const lastWordOfBot = game.lastPhraseBot.split(/\s+/).pop();
  if (!cleanContentTrim.startsWith(lastWordOfBot)) {
    isChainValid = false;
  }

  if (!isWordValid || !isChainValid) {
    let attempts = game.incorrectAttempts.get(senderId) + 1;
    game.incorrectAttempts.set(senderId, attempts);

    if (attempts >= 2) {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển -> sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${lastWordOfBot}".`;
      
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua!\n${reason} (2 lần sai)`);
      activeGames.delete(threadId);
    } else {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển hoặc sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${lastWordOfBot}".`;
      
      await sendMessageWarning(api, message, `${reason}\nBạn còn 1 lần đoán sai trước khi bị loại!`);
    }
    return;
  }

  game.lastPhraseUser = cleanContentTrim;
  game.incorrectAttempts.set(senderId, 0);
  game.processingBot = true;

  const botPhrase = await findNextPhrase(game.lastPhraseUser);
  if (botPhrase) {
    const botResult = await checkWordValidity(botPhrase);
    const isBotPhraseValid = botResult.success;
    const lastWordOfUserPhrase = game.lastPhraseUser.split(/\s+/).pop();
    const isBotChainValid = botPhrase.startsWith(lastWordOfUserPhrase);

    if (isBotPhraseValid && isBotChainValid) {
      game.lastPhraseBot = botPhrase;
      await sendMessageComplete(api, message, `🤖 Bot: ${botPhrase}\n\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`);
      game.processingBot = false;
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
