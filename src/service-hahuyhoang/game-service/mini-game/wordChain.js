import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

const pendingPVPChallenges = new Map();

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

export async function handlePVPConfirmation(api, reaction) {
  try {
    const userId = reaction.data.uidFrom;
    const rType = reaction.data.content.rType;
    const threadId = reaction.data.idTo;
    
    if (rType !== 3 && rType !== 5) return false;
    
    const challengeKey = `${threadId}_${userId}`;
    if (!pendingPVPChallenges.has(challengeKey)) return false;
    
    const challenge = pendingPVPChallenges.get(challengeKey);
    clearTimeout(challenge.timeout);
    pendingPVPChallenges.delete(challengeKey);
    
    getActiveGames().set(threadId, {
      type: 'wordChainPVP',
      game: {
        player1: { id: challenge.challengerId, name: challenge.challengerName, incorrectAttempts: 0 },
        player2: { id: userId, name: challenge.opponentName, incorrectAttempts: 0 },
        currentTurn: challenge.challengerId,
        lastPhrase: "",
        maxWords: 2,
        waitingForFirstWord: true
      }
    });
    
    const confirmMsg = {
      threadId: threadId,
      type: MessageType.GroupMessage,
      data: {
        content: `⚔️ Trận đấu nối từ bắt đầu!\n\n👤 ${challenge.challengerName} vs 👤 ${challenge.opponentName}\n\n🎯 ${challenge.challengerName} hãy nhập cụm từ đầu tiên (2 từ) để bắt đầu!`,
        uidFrom: userId,
        dName: `${challenge.challengerName}`
      }
    };
    
    await sendMessageComplete(api, confirmMsg, confirmMsg.data.content);
    return true;
  } catch (error) {
    console.error("Lỗi xác nhận PVP:", error);
    return false;
  }
}

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();
  const mentions = message.data.mentions;

  if (args[0]?.toLowerCase() === `${prefix}noitu` && !args[1]) {
    await sendMessageComplete(api, message, `🎮 Hướng dẫn game nối từ:\n🔗 ${prefix}noitu join: tham gia trò chơi nối từ với Bot.\n🔖 ${prefix}noitu leave: rời khỏi trò chơi nối từ.\n⚔️ ${prefix}noitu pvp @user: thách đấu 1v1 với người chơi khác.`);
    return;
  }

  if (args[1]?.toLowerCase() === "pvp") {
    if (!mentions || mentions.length === 0) {
      await sendMessageWarning(api, message, "Vui lòng đề cập (@mention) người chơi bạn muốn thách đấu.");
      return;
    }

    const challengerId = message.data.uidFrom;
    const challengerName = message.data.dName;
    const opponentId = mentions[0].uid;
    const opponentName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");

    if (challengerId === opponentId) {
      await sendMessageWarning(api, message, "Bạn không thể thách đấu chính mình!");
      return;
    }

    if (await checkHasActiveGame(api, message, threadId)) {
      return;
    }

    const challengeKey = `${threadId}_${opponentId}`;
    if (pendingPVPChallenges.has(challengeKey)) {
      await sendMessageWarning(api, message, "Người chơi này đã có lời thách đấu đang chờ xác nhận.");
      return;
    }

    const timeout = setTimeout(async () => {
      if (pendingPVPChallenges.has(challengeKey)) {
        pendingPVPChallenges.delete(challengeKey);
        try {
          const cancelMsg = {
            threadId: threadId,
            data: {
              content: `⏰ Lời thách đấu từ ${challengerName} đến ${opponentName} đã hết hạn (30s).`,
              uidFrom: challengerId
            }
          };
          await sendMessageWarning(api, cancelMsg, cancelMsg.data.content);
        } catch (error) {
          console.error("Lỗi khi hủy thách đấu:", error);
        }
      }
    }, 30000);

    pendingPVPChallenges.set(challengeKey, {
      challengerId,
      challengerName,
      opponentId,
      opponentName,
      timeout
    });

    await sendMessageComplete(api, message, `⚔️ ${challengerName} thách đấu ${opponentName}!\n\n👉 ${opponentName} hãy thả reaction (LIKE hoặc HEART) vào tin nhắn này để chấp nhận!\n⏰ Thời gian: 30 giây`);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (getActiveGames().has(threadId)) {
      const gameData = getActiveGames().get(threadId);
      
      if (gameData.type === 'wordChainPVP') {
        const game = gameData.game;
        if (game.player1.id === message.data.uidFrom || game.player2.id === message.data.uidFrom) {
          const winnerName = game.player1.id === message.data.uidFrom ? game.player2.name : game.player1.name;
          await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã rời trận!\n🎉 ${winnerName} thắng!`);
          getActiveGames().delete(threadId);
        } else {
          await sendMessageWarning(api, message, "Bạn không tham gia trận đấu này.");
        }
        return;
      }

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
      if (gameData.type === 'wordChainPVP') {
        await sendMessageWarning(api, message, "Đang có trận PVP, không thể tham gia chế độ Bot.");
        return;
      }
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
      await sendMessageWarning(api, message, "❌ Không thể khởi tạo trò chơi. Vui lòng thử lại sau.");
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

  if (gameData.type === 'wordChainPVP') {
    await handlePVPMessage(api, message, gameData.game, threadId);
    return;
  }

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
  
  const isWordValid = await checkWordValidity(cleanContentTrim);
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
    const isBotPhraseValid = await checkWordValidity(botPhrase);
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

async function handlePVPMessage(api, message, game, threadId) {
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();
  
  if (senderId !== game.player1.id && senderId !== game.player2.id) return;

  const content = message.data.content || "";
  const cleanContent = content.toLowerCase();
  const cleanContentTrim = cleanContent.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

  if (cleanContent !== cleanContentTrim) return;
  if (cleanContent.startsWith(prefix)) return;
  if (message.data.mentions && message.data.mentions.length > 0) return;

  const words = cleanContentTrim.split(/\s+/);
  if (words.length !== game.maxWords) return;

  const currentPlayer = senderId === game.player1.id ? game.player1 : game.player2;
  const opponent = senderId === game.player1.id ? game.player2 : game.player1;

  if (game.waitingForFirstWord) {
    if (senderId !== game.currentTurn) return;

    const isWordValid = await checkWordValidity(cleanContentTrim);
    if (!isWordValid) {
      currentPlayer.incorrectAttempts++;
      if (currentPlayer.incorrectAttempts >= 2) {
        await sendMessageComplete(api, message, `🚫 ${currentPlayer.name} đã thua!\nLý do: Từ "${cleanContentTrim}" không có trong từ điển (2 lần sai)\n\n🎉 ${opponent.name} thắng!`);
        getActiveGames().delete(threadId);
      } else {
        await sendMessageWarning(api, message, `Từ "${cleanContentTrim}" không có trong từ điển.\nBạn còn 1 lần đoán sai!`);
      }
      return;
    }

    game.lastPhrase = cleanContentTrim;
    game.waitingForFirstWord = false;
    game.currentTurn = opponent.id;
    const lastWord = cleanContentTrim.split(/\s+/).pop();
    await sendMessageComplete(api, message, `✅ ${currentPlayer.name}: ${cleanContentTrim}\n\n👉 ${opponent.name}, cụm từ tiếp theo phải bắt đầu bằng "${lastWord}"`);
    return;
  }

  if (senderId !== game.currentTurn) return;

  const isWordValid = await checkWordValidity(cleanContentTrim);
  let isChainValid = true;

  if (game.lastPhrase !== "") {
    const lastWordOfPreviousPhrase = game.lastPhrase.split(/\s+/).pop();
    if (!cleanContentTrim.startsWith(lastWordOfPreviousPhrase)) {
      isChainValid = false;
    }
  }

  if (!isWordValid || !isChainValid) {
    currentPlayer.incorrectAttempts++;
    if (currentPlayer.incorrectAttempts >= 2) {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}"`;
      
      await sendMessageComplete(api, message, `🚫 ${currentPlayer.name} đã thua!\n${reason} (2 lần sai)\n\n🎉 ${opponent.name} thắng!`);
      getActiveGames().delete(threadId);
    } else {
      let reason = "";
      if (!isWordValid) reason = `Từ "${cleanContentTrim}" không có trong từ điển`;
      else if (!isChainValid) reason = `Cụm từ không bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}"`;
      
      await sendMessageWarning(api, message, `${reason}\nBạn còn 1 lần đoán sai!`);
    }
    return;
  }

  currentPlayer.incorrectAttempts = 0;
  game.lastPhrase = cleanContentTrim;
  game.currentTurn = opponent.id;
  const lastWord = cleanContentTrim.split(/\s+/).pop();
  await sendMessageComplete(api, message, `✅ ${currentPlayer.name}: ${cleanContentTrim}\n\n👉 ${opponent.name}, cụm từ tiếp theo phải bắt đầu bằng "${lastWord}"`);
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
