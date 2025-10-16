import axios from "axios";
import path from "path";
import fs from "fs";
import { getFileExtension, getFileSize } from "../../../../api-zalo/utils.js";
import { deleteFile, execAsync, uploadTempFile } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";

/**
 * Chuyển đổi file MP3 sang M4A
 */
export async function convertToM4A(inputPath) {
  const outputPath = inputPath.replace(".mp3", ".m4a");
  const timeStart = performance.now()
  try {
    const ffmpegCommand = [
      "ffmpeg",
      "-y",
      "-i", inputPath,
      "-vn",
      "-c:a", "aac",
      "-q:a", "2",
      outputPath
    ].join(" ");

    await execAsync(ffmpegCommand);
    const timeEnd = performance.now();
    console.log(`Thời gian chuyển đổi sang M4A: ${((timeEnd - timeStart) / 1000).toFixed(2)} s`);
    return outputPath;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi sang M4A:", error);
    throw error;
  }
}

/**
 * Chuyển đổi file MP3 sang AAC
 */
export async function convertToAAC(inputPath) {
  const outputPath = inputPath.replace(".mp3", ".aac");
  try {
    const ffmpegCommand = [
      "ffmpeg",
      "-y",
      "-i", inputPath,
      "-vn",
      "-c:a", "aac",
      "-q:a", "2",
      outputPath
    ].join(" ");

    await execAsync(ffmpegCommand);
    return outputPath;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi sang AAC:", error);
    throw error;
  }
}

/**
 * Upload file audio và trả về URL
 */
/*
export async function uploadAudioFile(mp3Path, api, message) {
  let accPath = null;
  try {
    let voiceFinalUrl;
    const fileSize = await getFileSize(mp3Path);
    if (fileSize > 9437184) {
      const ext = getFileExtension(mp3Path);
      if (ext == "mp3") {
        accPath = await convertToAAC(mp3Path);
        voiceFinalUrl = await uploadTempFile(accPath, 2);
      } else if (ext == "aac" || ext == "m4a") {
        voiceFinalUrl = await uploadTempFile(mp3Path, 2);
      }
    } else {
      voiceFinalUrl = await api.uploadAttachment([mp3Path], message.threadId, message.type);
      console.log("Upload result:", voiceFinalUrl);
      voiceFinalUrl = voiceFinalUrl[0].fileUrl;
    }
    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    deleteFile(accPath);
  }
}
*/
export async function uploadAudioFile(mp3Path, api, message) {
  try {
    const uploadResult = await api.uploadAttachment([mp3Path], message.threadId, message.type);
    console.log("Upload result:", uploadResult);

    const rawUrl = uploadResult[0].fileUrl;
    const voiceFinalUrl = `${rawUrl}/Vu-Xuan-Kien-Service-Bot.aac`;

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  }
}
/**
 * Tải Và Chuyển Đổi Âm Thanh Sang Dạng Tương Thích
 */
export async function downloadAndConvertAudio(url, api, message) {
  const mp3Path = path.join(tempDir, `temp_${Date.now()}.mp3`);

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(mp3Path);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const voiceFinalUrl = await uploadAudioFile(mp3Path, api, message);

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await deleteFile(mp3Path);
  }
}

/**
 * Tách âm thanh từ video và chuyển đổi sang định dạng audio
 * @param {string|Buffer} input - URL video hoặc buffer của video
 * @returns {Promise<string>} URL của file âm thanh đã xử lý
 */
export async function extractAudioFromVideo(input, api, message) {
  // const timeStart = performance.now();
  const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
  const tempAudioPath = path.join(tempDir, `temp_audio_${Date.now()}.aac`);

  try {
    if (typeof input === 'string') {
      const response = await axios({
        url: input,
        method: 'GET',
        responseType: 'stream'
      });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempVideoPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } else {
      await fs.promises.writeFile(tempVideoPath, input);
    }

    const ffmpegCommand = [
      "ffmpeg",
      "-y",
      "-i", tempVideoPath,
      "-vn",
      "-c:a", "aac",
      "-q:a", "2",
      tempAudioPath
    ].join(" ");

    await execAsync(ffmpegCommand);

    const voiceFinalUrl = await uploadAudioFile(tempAudioPath, api, message);

    // const timeEnd = performance.now();
    // console.log(`Thời gian xử lý âm thanh: ${((timeEnd - timeStart) / 1000).toFixed(2)} s`);

    return voiceFinalUrl;

  } catch (error) {
    throw error;
  } finally {
    await Promise.all([
      deleteFile(tempVideoPath),
      deleteFile(tempAudioPath)
    ]);
  }
}
