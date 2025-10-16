import fs from 'fs';
import path from 'path';
import { MessageType } from "zlbotdqt";
import { dataGifPath } from '../../../../utils/io-json.js';

export async function sendGifRemote(api, message) {
  try {

    const gifUrl = 'https://fg42.dlfl.me/44014749ffe651b808f7/1046098583450403461';
    await api.sendGif(
      gifUrl,
      message,
      'N P H',
      0
    );

  } catch (error) {
    console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi gửi GIF. Vui lòng thử lại sau.",
        quote: message
      },
      message.threadId,
      MessageType.GroupMessage
    );
  }
}

export async function sendGifLocal(api, message) {
  try {
    const gifFiles = fs.readdirSync(dataGifPath).filter(file => file.endsWith('.gif'));

    if (gifFiles.length === 0) {
      throw new Error("Không tìm thấy file GIF nào trong thư mục.");
    }

    const randomGif = gifFiles[Math.floor(Math.random() * gifFiles.length)];
    const gifPath = path.join(dataGifPath, randomGif);

    await api.sendMessage(
      {
        msg: '',
        attachments: [gifPath]
      },
      message.threadId,
      MessageType.GroupMessage
    );

  } catch (error) {
    console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi gửi GIF. Vui lòng thử lại sau.",
        quote: message
      },
      message.threadId,
      MessageType.GroupMessage
    );
  }
}