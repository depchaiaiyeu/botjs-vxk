import path from "path";
import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, getVideoMetadata, handleZaloResponse, makeURL, request } from "../utils.js";
import { Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";
import { deleteFile, execAsync } from "../../utils/util.js";
import { tempDir } from "../../utils/io-json.js";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import fs from "fs";
import { promisify } from "util";
import { spawn } from "child_process";

let systemFFprobePath = null;
let useSystemFFprobe = false;

const findSystemFFprobe = async () => {
  if (systemFFprobePath) return systemFFprobePath;
  
  try {
    const { stdout } = await execAsync('which ffprobe', { timeout: 5000 });
    systemFFprobePath = stdout.trim();
    if (systemFFprobePath && fs.existsSync(systemFFprobePath)) {
      useSystemFFprobe = true;
      return systemFFprobePath;
    }
  } catch (error) {
    try {
      const { stdout } = await execAsync('whereis ffprobe', { timeout: 5000 });
      const paths = stdout.split(' ').slice(1).filter(p => p.endsWith('ffprobe'));
      for (const p of paths) {
        if (fs.existsSync(p)) {
          systemFFprobePath = p;
          useSystemFFprobe = true;
          return systemFFprobePath;
        }
      }
    } catch (e) {}
  }
  
  return ffprobeInstaller.path;
};

const getVideoInfoSafe = async (url, timeout = 25000) => {
  const ffprobePath = await findSystemFFprobe();
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Video analysis timeout'));
    }, timeout);

    if (!url || typeof url !== 'string') {
      clearTimeout(timeoutId);
      reject(new Error('Invalid video URL'));
      return;
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-select_streams', 'v:0',
      url
    ];

    const child = spawn(ffprobePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeout - 1000,
      killSignal: 'SIGKILL'
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      
      if (signal === 'SIGKILL' || signal === 'SIGSEGV') {
        reject(new Error('FFprobe process killed or crashed'));
        return;
      }

      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdout);
        
        let duration = 0;
        let width = 1280;
        let height = 720;
        let fileSize = 0;

        if (metadata.streams && metadata.streams.length > 0) {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video') || metadata.streams[0];
          duration = parseFloat(videoStream.duration) || 0;
          width = parseInt(videoStream.width) || 1280;
          height = parseInt(videoStream.height) || 720;
        }

        if (metadata.format) {
          if (!duration && metadata.format.duration) {
            duration = parseFloat(metadata.format.duration) || 0;
          }
          fileSize = parseInt(metadata.format.size) || 0;
        }

        resolve({
          duration: Math.max(0, duration * 1000),
          width: Math.max(1, width),
          height: Math.max(1, height),
          fileSize: Math.max(0, fileSize)
        });

      } catch (parseError) {
        reject(new Error('Failed to parse video metadata'));
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`FFprobe spawn error: ${error.message}`));
    });
  });
};

const getVideoInfoFallback = async (url) => {
  try {
    const ffprobePath = await findSystemFFprobe();
    const command = `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams -select_streams v:0 "${url}"`;
    
    const { stdout } = await execAsync(command, { 
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      killSignal: 'SIGKILL'
    });

    const metadata = JSON.parse(stdout);
    
    let duration = 0;
    let width = 1280;
    let height = 720;
    let fileSize = 0;

    if (metadata.streams && metadata.streams.length > 0) {
      const videoStream = metadata.streams.find(s => s.codec_type === 'video') || metadata.streams[0];
      duration = parseFloat(videoStream.duration) || 0;
      width = parseInt(videoStream.width) || 1280;
      height = parseInt(videoStream.height) || 720;
    }

    if (metadata.format) {
      if (!duration && metadata.format.duration) {
        duration = parseFloat(metadata.format.duration) || 0;
      }
      fileSize = parseInt(metadata.format.size) || 0;
    }

    return {
      duration: Math.max(0, duration * 1000),
      width: Math.max(1, width),
      height: Math.max(1, height),
      fileSize: Math.max(0, fileSize)
    };

  } catch (error) {
    throw new Error(`Fallback analysis failed: ${error.message}`);
  }
};

const getDefaultVideoInfo = () => ({
  duration: 10000,
  width: 1280,
  height: 720,
  fileSize: 1024 * 1024
});

export function sendVideov2Factory(api) {
  const directMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });
  const groupMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });

  return async function sendVideov2({
    videoUrl,
    threadId,
    threadType,
    message = null,
    ttl = 0,
  }) {
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");
    
    let videoInfo = getDefaultVideoInfo();

    try {
      try {
        videoInfo = await getVideoInfoSafe(videoUrl);
      } catch (primaryError) {
        try {
          videoInfo = await getVideoInfoFallback(videoUrl);
        } catch (fallbackError) {
          videoInfo = getDefaultVideoInfo();
        }
      }
    } catch (error) {
      videoInfo = getDefaultVideoInfo();
    }

    let thumbnailUrl = null;
    try {
      thumbnailUrl = videoUrl.replace(/\.[^/.]+$/, ".jpg");
    } catch (e) {
      thumbnailUrl = "";
    }

    const payload = {
      params: {
        clientId: String(Date.now()),
        ttl: ttl,
        zsource: 704,
        msgType: 5,
        msgInfo: JSON.stringify({
          videoUrl: String(videoUrl),
          thumbUrl: String(thumbnailUrl || ""),
          duration: Number(videoInfo.duration),
          width: Number(videoInfo.width),
          height: Number(videoInfo.height),
          fileSize: Number(videoInfo.fileSize),
          properties: {
            color: -1,
            size: -1,
            type: 1003,
            subType: 0,
            ext: {
              sSrcType: -1,
              sSrcStr: "",
              msg_warning_type: 0,
            },
          },
          title: message ? message.text : "",
        }),
      },
    };

    if (message && message.mention) {
      payload.params.mentionInfo = message.mention;
    }

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
      payload.params.imei = appContext.imei;
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      payload.params.visibility = 0;
      payload.params.grid = String(threadId);
      payload.params.imei = appContext.imei;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(payload.params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const response = await request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);
    
    return result.data;
  };
          }
