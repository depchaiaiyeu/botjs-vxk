import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { unlink, stat } from 'fs/promises';
import fs from 'fs';
import axios from 'axios';
import { performance } from 'perf_hooks';
import http from 'http';
import https from 'https';
import pLimit from 'p-limit';


const exec = promisify(execCallback);
const MAX_SIZE = 1 * 1024 * 1024 * 1024; // 1GB

// Lấy thời lượng video bằng ffprobe
async function getVideoDuration(filePath) {
  const { stdout } = await exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
  return parseFloat(stdout.trim());
}

export async function splitLargeFileEvenly(filePath, targetParts = 2) {
  const { size } = await stat(filePath);
  if (size <= MAX_SIZE) {
    return [filePath]; // Không cần chia
  }

  const duration = await getVideoDuration(filePath);
  const segmentSeconds = Math.ceil(duration / targetParts);

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);

  const partPattern = path.join(dir, `${baseName}_part_%03d${ext}`);
  const command = `ffmpeg -i "${filePath}" -c copy -map 0 -f segment -segment_time ${segmentSeconds} "${partPattern}"`;
  await exec(command);

  await unlink(filePath); // Xóa file gốc nếu cần

  // Thu thập danh sách các part
  const parts = [];
  let index = 0;
  while (true) {
    const part = path.join(dir, `${baseName}_part_${index.toString().padStart(3, '0')}${ext}`);
    try {
      await stat(part);
      parts.push(part);
      index++;
    } catch {
      break;
    }
  }

  return parts;
}

export async function downloadM3U8ToMP4(m3u8Url, outputPath) {
  const tempTsFile = 'all.ts';

  const agent = {
    http: new http.Agent({ keepAlive: true, maxSockets: 1000 }),
    https: new https.Agent({ keepAlive: true, maxSockets: 1000 })
  };

  const start = performance.now();
  const { data } = await axios.get(m3u8Url, { httpsAgent: agent.https });

  const baseUrl = m3u8Url.slice(0, m3u8Url.lastIndexOf('/') + 1);
  const tsUrls = data.split('\n').filter(line => line && !line.startsWith('#'));
  const segmentCount = tsUrls.length;

  console.log(`Segments: ${segmentCount}`);

  const writeStream = fs.createWriteStream(tempTsFile);
  const buffers = new Array(segmentCount);
  const status = new Array(segmentCount).fill(false);

  let totalBytes = 0;
  let writtenIndex = 0;
  let completed = 0;

  const limit = pLimit(500);

  const flush = async () => {
    while (status[writtenIndex]) {
      writeStream.write(buffers[writtenIndex]);
      buffers[writtenIndex] = null;
      writtenIndex++;
    }
  };

  const downloadTasks = tsUrls.map((tsFile, index) => limit(async () => {
    const tsUrl = tsFile.startsWith('http') ? tsFile : baseUrl + tsFile;

    const res = await axios.get(tsUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      httpAgent: agent.http,
      httpsAgent: agent.https,
    });

    const buf = Buffer.from(res.data);
    buffers[index] = buf;
    status[index] = true;
    totalBytes += buf.length;
    completed++;

    if (completed % 10 === 0 || completed === segmentCount) {
      process.stdout.write(`Downloaded ${completed}/${segmentCount} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)\r`);
    }

    await flush();
  }));

  await Promise.all(downloadTasks);
  writeStream.end();
  await new Promise(resolve => writeStream.on('finish', resolve));

  const downloadEnd = performance.now();
  const downloadTime = ((downloadEnd - start) / 1000).toFixed(2);
  const speed = (totalBytes / 1024 / 1024 / downloadTime).toFixed(2);

  console.log(`\nDownloaded ${(totalBytes / 1024 / 1024).toFixed(0)} MB in ${downloadTime}s (${speed} MB/s)`);

  console.log('Merging to MP4...');
  const mergeStart = performance.now();

  await new Promise((resolve, reject) => {
    const cmd = `ffmpeg -y -i "${tempTsFile}" -c copy "${outputPath}"`;
    exec(cmd, (err) => {
      if (err) return reject(err);
      fs.unlinkSync(tempTsFile);
      resolve();
    });
  });

  const mergeEnd = performance.now();
  const mergeTime = ((mergeEnd - mergeStart) / 1000).toFixed(2);
  const totalTime = ((mergeEnd - start) / 1000).toFixed(2);

  console.log(`Merged to ${outputPath} in ${mergeTime}s`);
  console.log('Temporary file all.ts deleted');
  console.log(`Total time: ${totalTime}s (Download: ${downloadTime}s | Merge: ${mergeTime}s)`);
}