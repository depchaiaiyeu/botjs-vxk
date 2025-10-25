import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

const botDataMap = new Map();
const playerDataMap = new Map();
const turnTimersMap = new Map();

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
      return { original: response.data.chuan, normalized: response.data.chuan.toLowerCase() };
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
        
        const playerKey = `${threadId}_${message.data.uidFrom}`;
        playerDataMap.delete(playerKey);
        clearTurnTimer(threadId, message.data.uidFrom);
        
        if (game.players.size === 0) {
          getActiveGames().delete(threadId);
          botDataMap.delete(threadId);
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
        const playerKey = `${threadId}_${message.data.uidFrom}`;
        playerDataMap.set(playerKey, {
          incorrectAttempts: 0,
          lastPhrase: "",
          lastMessageTime: Date.now()
        });
        await sendMessageComplete(api, message, "Bạn đã tham gia trò chơi nối từ.");
      }
      return;
    }

    const initialWordData = await getInitialWord();
    if (!initialWordData) {
      await sendMessageWarning(api, message, "🚫 Không thể khởi tạo trò chơi. Vui lòng thử lại sau.");
      return;
    }

    botDataMap.set(threadId, {
      lastPhrase: initialWordData.normalized
    });

    const playerKey = `${threadId}_${message.data.uidFrom}`;
    playerDataMap.set(playerKey, {
      incorrectAttempts: 0,
      lastPhrase: "",
      lastMessageTime: Date.now()
    });

    getActiveGames().set(threadId, {
      type: 'wordChain',
      game: {
        players: new Set([message.data.uidFrom]),
        currentPlayer: message.data.uidFrom,
        maxWords: 2,
        processingBot: false,
        turnTimeout: 60000
      }
    });

    const lastWord = initialWordData.normalized.split(/\s+/).pop();
    await sendMessageComplete(api, message, `🎮 Trò chơi nối từ bắt đầu!\n\n🤖 Bot: ${initialWordData.original}\n\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${lastWord}"\n⏱️ Bạn có 60 giây để trả lời!`);
    
    startTurnTimer(api, message, threadId, message.data.uidFrom);
    return;
  }
}

function startTurnTimer(api, message, threadId, playerId) {
  const gameData = getActiveGames().get(threadId);
  if (!gameData) return;
  
  const timerKey = `${threadId}_${playerId}`;
  
  if (turnTimersMap.has(timerKey)) {
    clearTimeout(turnTimersMap.get(timerKey));
  }
  
  const timer = setTimeout(async () => {
    const currentGameData = getActiveGames().get(threadId);
    if (!currentGameData || currentGameData.type !== 'wordChain') return;
    
    const currentGame = currentGameData.game;
    if (currentGame.currentPlayer !== playerId) return;
    
    await sendMessageComplete(api, message, `⏰ Hết thời gian! Người chơi không trả lời Bot trong 60 giây.\n🚫 Trò chơi kết thúc!`);
    
    getActiveGames().delete(threadId);
    botDataMap.delete(threadId);
    playerDataMap.delete(`${threadId}_${playerId}`);
    turnTimersMap.delete(timerKey);
  }, gameData.game.turnTimeout);
  
  turnTimersMap.set(timerKey, timer);
}

function clearTurnTimer(threadId, playerId) {
  const timerKey = `${threadId}_${playerId}`;
  if (turnTimersMap.has(timerKey)) {
    clearTimeout(turnTimersMap.get(timerKey));
    turnTimersMap.delete(timerKey);
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
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

  if (cleanContent !== cleanContentTrim) return;
  if (cleanContent.startsWith(prefix)) return;
  if (!game.players.has(senderId)) return;
  if (game.currentPlayer !== senderId) return;
  if (game.processingBot) return;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length !== game.maxWords) return;

  clearTurnTimer(threadId, senderId);

  const playerKey = `${threadId}_${senderId}`;
  const playerData = playerDataMap.get(playerKey);
  
  if (!playerData) return;
  
  if (playerData.lastPhrase === cleanContentTrim) {
    return;
  }

  const result = await checkWordValidity(cleanContentTrim);
  const isWordValid = result.success;
  let isChainValid = true;

  const botData = botDataMap.get(threadId);
  if (!botData) return;

  const lastWordOfBot = botData.lastPhrase.split(/\s+/).pop();
  const firstWordOfUser = cleanContentTrim.split(/\s+/)[0];
  
  if (firstWordOfUser !== lastWordOfBot) {
    isChainValid = false;
  }

  if (!isWordValid || !isChainValid) {
    let attempts = playerData.incorrectAttempts + 1;
    playerData.incorrectAttempts = attempts;

    if (attempts >= 2) {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển -> sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${lastWordOfBot}".`;
      
      await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua!\n${reason} (2 lần sai)`);
      
      getActiveGames().delete(threadId);
      botDataMap.delete(threadId);
      playerDataMap.delete(playerKey);
      clearTurnTimer(threadId, senderId);
    } else {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển hoặc sai nghĩa.`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${lastWordOfBot}".`;
      
      await sendMessageWarning(api, message, `${reason}\nBạn còn 1 lần đoán sai trước khi bị loại!`);
      startTurnTimer(api, message, threadId, senderId);
    }
    return;
  }

  playerData.lastPhrase = cleanContentTrim;
  playerData.incorrectAttempts = 0;
  playerData.lastMessageTime = Date.now();
  game.processingBot = true;

  const botPhraseData = await findNextPhrase(cleanContentTrim);
  if (botPhraseData) {
    const botResult = await checkWordValidity(botPhraseData.normalized);
    const isBotPhraseValid = botResult.success;
    const lastWordOfUserPhrase = cleanContentTrim.split(/\s+/).pop();
    const firstWordOfBot = botPhraseData.normalized.split(/\s+/)[0];
    const isBotChainValid = firstWordOfBot === lastWordOfUserPhrase;

    if (isBotPhraseValid && isBotChainValid) {
      botData.lastPhrase = botPhraseData.normalized;
      await sendMessageComplete(api, message, `🤖 Bot: ${botPhraseData.original}\n\n👉 Cụm từ tiếp theo phải bắt đầu bằng "${botPhraseData.normalized.split(/\s+/).pop()}"\n⏱️ Bạn có 60 giây để trả lời!`);
      game.processingBot = false;
      startTurnTimer(api, message, threadId, senderId);
    } else {
      let botReason = "";
      if (!isBotPhraseValid) botReason = `từ "${botPhraseData.original}" của bot không hợp lệ`;
      else if (!isBotChainValid) botReason = `từ "${botPhraseData.original}" của bot không bắt đầu bằng "${lastWordOfUserPhrase}"`;

      await sendMessageComplete(api, message, `🎉 Bot không tìm được cụm từ phù hợp hoặc ${botReason}.\nBot thua, bạn thắng!`);
      
      getActiveGames().delete(threadId);
      botDataMap.delete(threadId);
      playerDataMap.delete(playerKey);
      clearTurnTimer(threadId, senderId);
    }
  } else {
    await sendMessageComplete(api, message, "🎉 Bot không tìm được cụm từ phù hợp. Bạn thắng!");
    
    getActiveGames().delete(threadId);
    botDataMap.delete(threadId);
    playerDataMap.delete(playerKey);
    clearTurnTimer(threadId, senderId);
  }
}

async function findNextPhrase(lastPhrase) {
  try {
    const encodedWord = encodeURIComponent(lastPhrase);
    const response = await axios.get(`https://noitu.pro/answer?word=${encodedWord}`);
    if (response.data.success && response.data.nextWord && response.data.nextWord.text) {
      return { original: response.data.nextWord.text, normalized: response.data.nextWord.text.toLowerCase() };
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi gọi API nối từ để tìm từ tiếp theo:", error.message);
    return null;
  }
}
