// game.js

import fs from "fs";
import path from "path";

// Đường dẫn tới file JSON
const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "data", "hinh");
const QUESTIONS_FILE_PATH = path.join(process.cwd(), "assets", "json-data", "data_dhbc.json");
const TOP_RANK_FILE_PATH = path.join(process.cwd(), "assets", "json-data", "top_rank.json");

// Đọc dữ liệu câu hỏi từ file JSON
function loadQuestionsData() {
  let data;
  try {
    const rawData = fs.readFileSync(QUESTIONS_FILE_PATH);
    data = JSON.parse(rawData);
  } catch (error) {
    // Nếu file không tồn tại, tạo mới
    data = { questions: [] };
    saveQuestionsData(data);
  }
  return data;
}

// Đọc dữ liệu Top người chơi từ file JSON
function loadTopRankData() {
  let data;
  try {
    const rawData = fs.readFileSync(TOP_RANK_FILE_PATH);
    data = JSON.parse(rawData);
  } catch (error) {
    // Nếu file không tồn tại, tạo mới
    data = [];
    saveTopRankData(data);
  }
  return data;
}

// Lưu dữ liệu câu hỏi vào file JSON
function saveQuestionsData(data) {
  fs.writeFileSync(QUESTIONS_FILE_PATH, JSON.stringify(data, null, 2));
}

// Lưu dữ liệu Top người chơi vào file JSON
function saveTopRankData(data) {
  fs.writeFileSync(TOP_RANK_FILE_PATH, JSON.stringify(data, null, 2));
}

// Lệnh khởi động game
export async function startGame(api, message, groupSettings) {
  const questionsData = loadQuestionsData();
  const randomQuestion = getRandomQuestion(questionsData.questions);

  const currentQuestion = {
    id: randomQuestion.id,
    answer: randomQuestion.answer,
    hintLetters: shuffleString(randomQuestion.answer),
    hintIndex: 0,
  };

  const data = { currentQuestion };
  saveQuestionsData(data);

  const imagePath = path.join(RESOURCE_BASE_PATH, `${randomQuestion.id}.jpg`);
  await api.sendMessage(
    { msg: `🎮 Đuổi hình bắt chữ! Câu hỏi số ${randomQuestion.id}:`, attachments: [imagePath] },
    message.threadId,
    message.type
  );

  await api.sendMessage(
    { msg: `💭 Đáp án: ${generateAnswerHint(randomQuestion.answer, 0)}`, quote: message },
    message.threadId,
    message.type
  );
}

// Lệnh gợi ý
export async function giveHint(api, message, groupSettings) {
  const questionsData = loadQuestionsData();
  const currentQuestion = questionsData.currentQuestion;

  if (!currentQuestion) {
    await api.sendMessage(
      { msg: "Game chưa bắt đầu, sử dụng !dhbc start để bắt đầu.", quote: message },
      message.threadId,
      message.type
    );
    return;
  }

  const hint = generateAnswerHint(currentQuestion.answer, currentQuestion.hintIndex);
  
  currentQuestion.hintIndex++;
  saveQuestionsData({ currentQuestion });

  await api.sendMessage(
    { msg: `💡 Gợi ý: ${hint}`, quote: message },
    message.threadId,
    message.type
  );
}

// Lệnh trả lời
export async function answerQuestion(api, message, groupSettings) {
  const questionsData = loadQuestionsData();
  const currentQuestion = questionsData.currentQuestion;

  if (!currentQuestion) {
    await api.sendMessage(
      { msg: "Game chưa bắt đầu, sử dụng !dhbc start để bắt đầu.", quote: message },
      message.threadId,
      message.type
    );
    return;
  }

  const playerAnswer = message.data.content.trim().toLowerCase();

  if (playerAnswer === currentQuestion.answer.toLowerCase()) {
    const playerName = message.data.dName;

    const topRankData = loadTopRankData();

    const playerRank = topRankData.find(entry => entry.name === playerName);
    if (!playerRank) {
      topRankData.push({ name: playerName, correctAnswers: 1 });
    } else {
      playerRank.correctAnswers += 1;
    }

    topRankData.sort((a, b) => b.correctAnswers - a.correctAnswers);
    if (topRankData.length > 10) topRankData.length = 10;

    saveTopRankData(topRankData);

    const nextQuestion = getRandomQuestion(questionsData.questions);
    questionsData.currentQuestion = {
      id: nextQuestion.id,
      answer: nextQuestion.answer,
      hintLetters: shuffleString(nextQuestion.answer),
      hintIndex: 0,
    };
    saveQuestionsData(questionsData);

    await api.sendMessage(
      { msg: `🎉 Chúc mừng ${playerName}! Bạn đã trả lời đúng! Câu hỏi tiếp theo sẽ xuất hiện!`, quote: message },
      message.threadId,
      message.type
    );

    const imagePath = path.join(RESOURCE_BASE_PATH, `${nextQuestion.id}.jpg`);
    await api.sendMessage(
      { msg: `🎮 Câu hỏi tiếp theo số ${nextQuestion.id}:`, attachments: [imagePath] },
      message.threadId,
      message.type
    );
    await api.sendMessage(
      { msg: `💭 Đáp án: ${generateAnswerHint(nextQuestion.answer, 0)}`, quote: message },
      message.threadId,
      message.type
    );
  } else {
    await api.sendMessage(
      { msg: "❌ Câu trả lời sai. Cố gắng lần sau!", quote: message },
      message.threadId,
      message.type
    );
  }
}

// Lệnh xếp hạng
export async function showRank(api, message, groupSettings) {
  const topRankData = loadTopRankData();

  if (topRankData.length === 0) {
    await api.sendMessage(
      { msg: "Hiện tại chưa có ai trong bảng xếp hạng.", quote: message },
      message.threadId,
      message.type
    );
    return;
  }

  let rankMessage = "🏆 Bảng xếp hạng người chơi:\n";
  topRankData.forEach((entry, index) => {
    rankMessage += `${index + 1}. ${entry.name} - ${entry.correctAnswers} đúng\n`;
  });

  await api.sendMessage(
    { msg: rankMessage, quote: message },
    message.threadId,
    message.type
  );
}

// Hàm chọn câu hỏi ngẫu nhiên
function getRandomQuestion(questions) {
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
}

// Hàm xáo trộn một chuỗi
function shuffleString(str) {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; // Swap elements
  }
  return arr.join('');
}

// Hàm tạo gợi ý từ chữ cái
function generateAnswerHint(answer, hintIndex) {
  const hintLetters = answer.split('').filter(char => char !== ' ').map(char => char.toUpperCase());
  const shownLetters = hintLetters.slice(0, hintIndex);
  const remainingLetters = hintLetters.slice(hintIndex);

  const hint = shownLetters.map(letter => `${letter}`).join(" ") +
               (remainingLetters.length > 0 ? " 🔲".repeat(remainingLetters.length) : "");

  return hint;
}
