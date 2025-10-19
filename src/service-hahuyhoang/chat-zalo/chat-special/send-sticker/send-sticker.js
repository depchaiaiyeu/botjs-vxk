import fs from "fs"
import path from "path"
import https from "https"
import http from "http"
import { removeBackground } from "@imgly/background-removal-node"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"

function escapeFFmpegPath(filePath) {
  let escapedPath = filePath.replace(/\\/g, "/")
  if (escapedPath.match(/^[a-zA-Z]:/)) {
    escapedPath = "/" + escapedPath[0].toLowerCase() + escapedPath.substring(1)
  }
  return escapedPath.replace(/'/g, "'\\''")
}

function getRedirectUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http
    protocol.get(url, { method: "HEAD" }, (res) => {
      if (res.headers.location) {
        resolve(res.headers.location)
      } else {
        resolve(url)
      }
    }).on("error", () => resolve(url))
  })
}

async function removeBackgroundImgly(imagePath) {
  try {
    const blob = await removeBackground(imagePath)
    const buffer = Buffer.from(await blob.arrayBuffer())
    return buffer
  } catch (error) {
    console.error("Lỗi khi xóa phông:", error)
    throw error
  }
}

function applyRoundedCorners(inputPath, outputPath, radius) {
  const filterComplex = `format=yuva420p,geq=lum='p(X,Y)':a='if(gt(abs(W/2-X),W/2-${radius})*gt(abs(H/2-Y),H/2-${radius}),if(lte(hypot(${radius}-(W/2-abs(W/2-X)),${radius}-(H/2-abs(H/2-Y))),${radius}),255,0),255)'`
  
  execSync(`ffmpeg -y -i "${inputPath}" -filter_complex "${filterComplex}" "${outputPath}"`, { stdio: 'pipe' })
}

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url)
    return response
  } catch (error) {
    console.error("Lỗi khi lấy redirect URL:", error)
    return url
  }
}

async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, removeBackground = false, radius = 5) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null
  let bgRemovedPath = null
  let roundedPath = null

  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
      webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
      await downloadFileFake(redirectUrl, videoPath)
      execSync(`ffmpeg -y -i "${videoPath}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload video attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?creator=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
    } else {
      let downloadUrl = mediaUrl
      let fileExt = "jpg"
      if (mediaUrl.endsWith(".jxl")) {
        downloadUrl = mediaUrl.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg")
        fileExt = "jpg"
      } else {
        const urlObj = new URL(mediaUrl)
        const urlExt = path.extname(urlObj.pathname)
        if (urlExt) {
          fileExt = urlExt.slice(1)
        }
      }
      imagePath = path.join(tempDir, `sticker_image_${Date.now()}.${fileExt}`)
      convertedWebpPath = path.join(tempDir, `sticker_converted_${Date.now()}.webp`)
      await downloadFileFake(downloadUrl, imagePath)

      let processPath = imagePath
      if (removeBackground) {
        bgRemovedPath = path.join(tempDir, `sticker_bg_removed_${Date.now()}.png`)
        const pngBuffer = await removeBackgroundImgly(imagePath)
        fs.writeFileSync(bgRemovedPath, pngBuffer)
        processPath = bgRemovedPath
      }

      if (radius > 0) {
        roundedPath = path.join(tempDir, `sticker_rounded_${Date.now()}.png`)
        applyRoundedCorners(processPath, roundedPath, radius)
        processPath = roundedPath
      }

      execSync(`ffmpeg -y -i "${processPath}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload image attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?creator=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
    }
    return true
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error)
    throw error
  } finally {
    if (videoPath) await deleteFile(videoPath)
    if (webpPath) await deleteFile(webpPath)
    if (imagePath) await deleteFile(imagePath)
    if (convertedWebpPath) await deleteFile(convertedWebpPath)
    if (bgRemovedPath) await deleteFile(bgRemovedPath)
    if (roundedPath) await deleteFile(roundedPath)
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  const msgContent = message.data?.content || ""
  const args = msgContent.split(/\s+/)

  const removeBackgroundImg = args.includes("xp")
  
  let radius = 5
  for (const arg of args) {
    if (arg.startsWith("r") && !isNaN(parseInt(arg.substring(1)))) {
      radius = parseInt(arg.substring(1))
      break
    }
  }

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker${removeBackgroundImg ? " xp" : ""}.`, true)
    return
  }

  const cliMsgType = message.data?.quote?.cliMsgType
  if (![44, 32, 49].includes(cliMsgType)) {
    await sendMessageWarning(api, message, `${senderName}, Vui lòng reply vào tin nhắn có ảnh, video hoặc GIF để tạo sticker!`, true)
    return
  }

  const attach = quote.attach
  if (!attach) {
    await sendMessageWarning(api, message, `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`, true)
    return
  }

  try {
    const attachData = JSON.parse(attach)
    const mediaUrl = attachData.hdUrl || attachData.href
    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true)
      return
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"))

    const params = attachData.params || {}
    const duration = params.duration || 0
    if (cliMsgType === 44 && duration > 5000) {
      await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 5 giây!`, true)
      return
    }

    const width = params.width || 512
    const height = params.height || 512

    let statusMsg = `Đang tạo sticker cho ${senderName}`
    if (removeBackgroundImg) statusMsg += ", xóa phông"
    if (radius > 0) statusMsg += `, bo tròn ${radius}px`
    statusMsg += ", vui lòng chờ một chút!"
    
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, removeBackgroundImg, radius)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
