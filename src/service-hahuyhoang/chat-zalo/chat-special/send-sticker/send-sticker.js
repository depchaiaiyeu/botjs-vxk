import fs from "fs"
import path from "path"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"

export async function getVideoRedirectUrl(url) {
  try {
    const response = execSync(`curl -I "${url}"`, { encoding: 'utf8' })
    const locationMatch = response.match(/location:\s*(.+)/i)
    if (locationMatch) {
      return locationMatch[1].trim()
    }
    return url
  } catch (error) {
    return url
  }
}

export async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, radius = 5) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null
  
  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
      webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
      await downloadFileFake(redirectUrl, videoPath)
      let vfFilter = `-c:v libwebp -q:v 80`
      if (radius > 0) {
        vfFilter = `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuva420p,geq=lum='p(X,Y)':a='if(gt(abs(W/2-X),W/2-${radius})*gt(abs(H/2-Y),H/2-${radius}),255,if(lte(hypot(${radius}-(W/2-abs(W/2-X))),${radius}-(H/2-abs(H/2-Y))),${radius}),255,0))'" ${vfFilter}`
      }
      execSync(`ffmpeg -y -i "${videoPath}" ${vfFilter} "${webpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload video attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?createdBy=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
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
      let vfFilter = `-c:v libwebp -q:v 80`
      if (radius > 0) {
        vfFilter = `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuva420p,geq=lum='p(X,Y)':a='if(gt(abs(W/2-X),W/2-${radius})*gt(abs(H/2-Y),H/2-${radius}),255,if(lte(hypot(${radius}-(W/2-abs(W/2-X))),${radius}-(H/2-abs(H/2-Y))),${radius}),255,0))'" ${vfFilter}`
      }
      execSync(`ffmpeg -y -i "${imagePath}" ${vfFilter} "${convertedWebpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload image attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?createdBy=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
    }
    return true
  } catch (error) {
    throw error
  } finally {
    if (videoPath) await deleteFile(videoPath)
    if (webpPath) await deleteFile(webpPath)
    if (imagePath) await deleteFile(imagePath)
    if (convertedWebpPath) await deleteFile(convertedWebpPath)
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  const body = message.body
  
  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`, true)
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
  
  let radius = 5
  const commandPart = body.slice(prefix.length).trim()
  const match = commandPart.match(/sticker\s+r(\d+)/i)
  if (match) {
    radius = parseInt(match[1], 10)
    if (radius < 10 || radius > 50) {
      await sendMessageWarning(api, message, `${senderName}, Bán kính bo góc phải từ 10 đến 50!`, true)
      return
    }
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
    
    let statusMsg = `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`
    if (radius > 5) {
      statusMsg += ` Bo góc sticker: ${radius}%`
    }
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, radius)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
