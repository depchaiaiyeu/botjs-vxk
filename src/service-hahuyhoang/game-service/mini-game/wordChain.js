import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageFailed, sendMessageQuery, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";

const userFails = new Map();

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.trim().split(" ");
  const sub = args[1]?.toLowerCase();

  if (sub === "leave") {
    if (getActiveGames().has(threadId)) {
      getActiveGames().delete(threadId);
      await sendMessageComplete(api, message, "Bạn đã rời khỏi phòng nối từ.");
    } else {
      await sendMessageQuery(api, message, "Không có trò chơi nối từ nào đang diễn ra.");
    }
    return;
  }

  if (sub === "join") {
    if (await checkHasActiveGame(api, message, threadId)) return;

    getActiveGames().set(threadId, {
      type: "wordChain",
      game: {
        lastPhrase: "",
        players: new Map(),
        botTurn: false,
        maxWords: 2,
        timeout: null
      }
    });

    await sendMessageComplete(api, message, "Phòng nối từ đã được tạo. Người tham gia đầu tiên hãy nhập cụm từ gồm 2 từ để bắt đầu.");
  }
}

export async function handleWordChainMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();

  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== "wordChain") return;

  const game = activeGames.get(threadId).game;
  const content = message.data.content.trim().toLowerCase();
  const cleanContent = content.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!cleanContent) return;

  const words = cleanContent.split(/\s+/);
  if (words.length !== 2) return;

  const uid = message.data.uidFrom;

  if (!game.players.has(uid)) {
    game.players.set(uid, { fails: 0 });
  }

  clearTimeout(game.timeout);
  game.timeout = setTimeout(async () => {
    await sendMessageFailed(api, message, "Hết thời gian 30 giây! Bạn đã thua lượt này.");
    activeGames.delete(threadId);
  }, 30000);

  const checkWord = await verifyWord(cleanContent);
  if (!checkWord.success) {
    const player = game.players.get(uid);
    player.fails++;
    if (player.fails >= 2) {
      await sendMessageFailed(api, message, "Bạn đã nhập từ sai 2 lần. Bạn thua!");
      activeGames.delete(threadId);
    } else {
      await sendMessageQuery(api, message, `Cụm từ "${cleanContent}" không hợp lệ. (Lần ${player.fails}/2)`);
    }
    return;
  }

  if (!game.botTurn) {
    if (game.lastPhrase === "" || cleanContent.startsWith(game.lastPhrase.split(/\s+/).pop())) {
      game.lastPhrase = cleanContent;
      game.botTurn = true;

      const botPhrase = await findNextPhrase(game.lastPhrase);
      if (botPhrase) {
        const botCheck = await verifyWord(botPhrase);
        if (!botCheck.success) {
          await sendMessageComplete(api, message, "Bot không tìm được cụm từ phù hợp. Bạn thắng!");
          activeGames.delete(threadId);
          return;
        }

        game.lastPhrase = botPhrase;
        await sendMessageFromSQL(api, message, { message: `Bot: ${botPhrase}\nCụm từ tiếp theo phải bắt đầu bằng "${botPhrase.split(/\s+/).pop()}"`, success: true }, true, 180000);
        game.botTurn = false;
      } else {
        await sendMessageComplete(api, message, "Bot không tìm được cụm từ phù hợp. Bạn thắng!");
        activeGames.delete(threadId);
      }
    } else {
      await sendMessageQuery(api, message, `Cụm từ không hợp lệ! Cụm từ phải bắt đầu bằng "${game.lastPhrase.split(/\s+/).pop()}"`);
    }
  } else {
    game.botTurn = false;
  }

  if (game.players.size >= 10) {
    await sendMessageComplete(api, message, "Trò chơi kết thúc! Cảm ơn mọi người đã tham gia.");
    activeGames.delete(threadId);
  }
}

async function verifyWord(word) {
  try {
    const res = await axios.get(`https://noitu.pro/answer?word=${encodeURIComponent(word)}`);
    return res.data;
  } catch {
    return { success: false };
  }
}

async function findNextPhrase(lastPhrase) {
  try {
    const encoded = encodeURIComponent(lastPhrase);
    const res = await axios.get(`https://noitu.pro/answer?word=${encoded}`);
    if (res.data.success) {
      return res.data.nextWord.text;
    }
    return null;
  } catch {
    return null;
  }
}
