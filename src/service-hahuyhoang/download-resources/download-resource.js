import path from 'path';
import fs from 'fs';
import { getGlobalPrefix } from '../service.js';
import { removeMention } from '../../utils/format-util.js';
import { downloadFile, checkExstentionFileRemote } from '../../utils/util.js';
import { sendMessageWarningRequest, sendMessageCompleteRequest } from '../chat-zalo/chat-style/chat-style.js';

const RESOURCE_BASE_PATH = path.join(process.cwd(), 'assets', 'resources');

/**
 * Kiểm tra và tạo thư mục nếu chưa tồn tại
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Kiểm tra tính hợp lệ của tên thư mục
 */
function isValidDirectory(dirName) {
  const fullPath = path.join(RESOURCE_BASE_PATH, dirName);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}

/**
 * Xử lý lệnh tải resource
 */
export async function handleDownloadResource(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  if (args.length < 2) {
    const object = {
      caption: `Vui lòng nhập đúng cú pháp: ${prefix}${aliasCommand} [thư mục]|[tên file]|[link (nếu Không reply)]`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const [dirName, fileName, link] = args;

  if (!isValidDirectory(dirName)) {
    const object = {
      caption: `Thư mục "${dirName}" Không tồn tại trong resource!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  let fileUrl = null;
  const quote = message.data?.quote;

  if (quote) {
    try {
      const parseMessage = JSON.parse(quote.attach);
      fileUrl = parseMessage?.href;
    } catch (error) {
      console.error("Lỗi khi parse quote:", error);
    }
  } else if (link) {
    fileUrl = link;
  }

  if (!fileUrl) {
    const object = {
      caption: `Vui lòng cung cấp link hoặc reply tin nhắn chứa file cần tải!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    const ext = await checkExstentionFileRemote(fileUrl);
    const fullFileName = fileName.includes('.') ? fileName : `${fileName}.${ext}`;
    const savePath = path.join(RESOURCE_BASE_PATH, dirName, fullFileName);

    if (fs.existsSync(savePath)) {
      const object = {
        caption: `❌ File "${fullFileName}" đã tồn tại trong thư mục "${dirName}"!\nVui lòng chọn tên file khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    ensureDirectoryExists(path.join(RESOURCE_BASE_PATH, dirName));
    await downloadFile(fileUrl, savePath);

    const object = {
      caption: `✅ Đã tải và lưu file thành công!\n📂 Thư mục: ${dirName}\n📄 Tên file: ${fullFileName}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } catch (error) {
    console.error("Lỗi khi tải file:", error);
    const object = {
      caption: `❌ Đã xảy ra lỗi khi tải file. Vui lòng thử lại sau!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

/**
 * Xử lý lệnh xóa resource
 */
export async function handleDeleteResource(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  if (args.length < 2) {
    const object = {
      caption: `Vui lòng nhập đúng cú pháp: ${prefix}${aliasCommand} [thư mục]|[tên file]`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const [dirName, fileName] = args;

  if (!isValidDirectory(dirName)) {
    const object = {
      caption: `Thư mục "${dirName}" Không tồn tại trong resource!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const dirPath = path.join(RESOURCE_BASE_PATH, dirName);
  const files = fs.readdirSync(dirPath);
  const matchingFiles = files.filter(file => 
    file.toLowerCase().startsWith(fileName.toLowerCase())
  );

  if (matchingFiles.length === 0) {
    const object = {
      caption: `Không tìm thấy file "${fileName}" trong thư mục "${dirName}"!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    for (const file of matchingFiles) {
      const filePath = path.join(dirPath, file);
      fs.unlinkSync(filePath);
    }

    const object = {
      caption: `✅ Đã xóa ${matchingFiles.length} file thành công!\n📂 Thư mục: ${dirName}\n📄 Các file đã xóa:\n${matchingFiles.join('\n')}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } catch (error) {
    console.error("Lỗi khi xóa file:", error);
    const object = {
      caption: `❌ Đã xảy ra lỗi khi xóa file. Vui lòng thử lại sau!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
