import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js"; // Import necessary styles

const playerCooldowns = new Map();

export async function handleGuessNumberCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();
  const activeGames = getActiveGames();
  const senderId = message.data.uidFrom;

  if (args[0]?.toLowerCase() === `${prefix}doanso` && !args[1]) {
    await sendMessageCompleteRequest(api, message, {
      caption: `Hướng dẫn game đoán số. 🎲\n${prefix}doanso join -> Tham gia trò chơi đoán số với Bot (phạm vi mặc định 1-20).\n${prefix}doanso join [số_lớn_nhất] -> Tham gia trò chơi với phạm vi tùy chỉnh.\n${prefix}doanso leave -> Rời khỏi trò chơi đoán số.`,
    }, 180000);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (activeGames.has(threadId)) {
      const game = activeGames.get(threadId).game;
      if (game.players.has(senderId)) {
        game.players.delete(senderId);
        if (game.players.size === 0) {
          activeGames.delete(threadId);
          await sendMessageCompleteRequest(api, message, {
            caption: "🚫 Trò chơi đoán số đã được hủy bỏ do không còn người chơi.",
          }, 180000);
        } else {
          await sendMessageCompleteRequest(api, message, {
            caption: "👋 Bạn đã rời khỏi trò chơi đoán số.",
          }, 180000);
        }
      } else {
        await sendMessageWarningRequest(api, message, {
          caption: "⚠️ Bạn chưa tham gia trò chơi đoán số nào trong nhóm này.",
        }, 180000);
      }
    } else {
      await sendMessageWarningRequest(api, message, {
        caption: "⚠️ Không có trò chơi đoán số nào đang diễn ra để rời khỏi.",
      }, 180000);
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    let range = 20; // Default range
    if (args.length > 2) {
      const customRange = parseInt(args[2]);
      if (!isNaN(customRange) && customRange >= 2) {
        range = customRange;
      } else {
        await sendMessageWarningRequest(api, message, {
          caption: "⚠️ Số lớn nhất phải là một số nguyên lớn hơn hoặc bằng 2. Sử dụng phạm vi mặc định 1-20.",
        }, 180000);
      }
    }

    if (await checkHasActiveGame(api, message, threadId)) {
      const game = activeGames.get(threadId).game;
      if (game.players.has(senderId)) {
        await sendMessageWarningRequest(api, message, {
          caption: "⚠️ Bạn đã tham gia trò chơi đoán số rồi.",
        }, 180000);
      } else {
        game.players.add(senderId);
        await sendMessageCompleteRequest(api, message, {
          caption: "✅ Bạn đã tham gia trò chơi đoán số.",
        }, 180000);
      }
      return;
    }

    const targetNumber = Math.floor(Math.random() * range) + 1;
    const maxAttemptsPerPlayer = 5; // Each player gets 5 incorrect guesses

    activeGames.set(threadId, {
      type: 'guessNumber',
      game: {
        targetNumber,
        players: new Map([[senderId, { attempts: 0 }]]), // Store attempts per player
        range,
        maxAttemptsPerPlayer
      }
    });

    await sendMessageCompleteRequest(api, message, {
      caption: `🎮 Trò chơi đoán số bắt đầu! Hãy đoán một số từ 1 đến ${range}. Bạn có tối đa ${maxAttemptsPerPlayer} lượt đoán sai.`,
    }, 180000);
    return;
  }
}

export async function handleGuessNumberGame(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const activeGames = getActiveGames();

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== 'guessNumber') return;

  const game = activeGames.get(threadId).game;
  const guessedNumber = parseInt(message.data.content);

  if (!game.players.has(senderId)) {
    return; // Ignore messages from non-participating players
  }

  if (isNaN(guessedNumber) || guessedNumber < 1 || guessedNumber > game.range) {
    return; // Ignore invalid guesses (not a number, out of range)
  }

  const playerAttempts = game.players.get(senderId);

  if (guessedNumber === game.targetNumber) {
    await handleCorrectGuess(api, message, threadId, game, senderId);
  } else if (guessedNumber < game.targetNumber) {
    playerAttempts.attempts++;
    await sendMessageWarningRequest(api, message, {
      caption: `Số bạn đoán nhỏ hơn. Hãy thử lại! (Bạn còn ${game.maxAttemptsPerPlayer - playerAttempts.attempts} lượt sai)`,
    }, 10000);
  } else {
    playerAttempts.attempts++;
    await sendMessageWarningRequest(api, message, {
      caption: `Số bạn đoán lớn hơn. Hãy thử lại! (Bạn còn ${game.maxAttemptsPerPlayer - playerAttempts.attempts} lượt sai)`,
    }, 10000);
  }

  if (playerAttempts.attempts >= game.maxAttemptsPerPlayer) {
    await handlePlayerEliminated(api, message, threadId, game, senderId);
  }

  // If no players left, end the game
  if (game.players.size === 0) {
    await handleGameOver(api, message, threadId, game, true); // True means all players eliminated
  }
}

async function handleCorrectGuess(api, message, threadId, game, senderId) {
  await sendMessageCompleteRequest(api, message, {
    caption: `🎉 Chúc mừng ${message.data.dName}! Bạn đã đoán đúng số ${game.targetNumber} sau ${game.players.get(senderId).attempts + 1} lần thử.`,
  });
  getActiveGames().delete(threadId);
}

async function handlePlayerEliminated(api, message, threadId, game, senderId) {
  await sendMessageCompleteRequest(api, message, {
    caption: `❌ ${message.data.dName} đã thua! Bạn đã hết lượt đoán sai. Số cần đoán là ${game.targetNumber}.`,
  });
  game.players.delete(senderId); // Remove player from the game
  playerCooldowns.delete(`${threadId}-${senderId}`); // Clear cooldown if any
}

async function handleGameOver(api, message, threadId, game, allPlayersEliminated = false) {
  if (allPlayersEliminated) {
    await sendMessageCompleteRequest(api, message, {
      caption: `🏁 Trò chơi kết thúc! Không còn người chơi nào. Số cần đoán là ${game.targetNumber}.`,
    });
  } else {
    await sendMessageCompleteRequest(api, message, {
      caption: `🏁 Trò chơi kết thúc! Số cần đoán là ${game.targetNumber}.`,
    });
  }
  getActiveGames().delete(threadId);
  for (const [pId] of game.players) {
    playerCooldowns.delete(`${threadId}-${pId}`);
  }
}
