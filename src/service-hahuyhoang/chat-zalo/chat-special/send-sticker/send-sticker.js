import fs from "fs"
import path from "path"
import { getGlobalPrefix } from "../../../service.js"
import { checkExstentionFileRemote, deleteFile, downloadFileFake } from "../../../../utils/util.js"
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
    console.error("Lỗi khi lấy redirect URL:", error)
    return url
  }
}

export async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType) {
  const threadId = message.threadId
  
  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      const videoPath = path.join(tempDir, `sticker_${Date.now()}.mp4`)
      const webpPath = path.join(tempDir, `sticker_${Date.now()}.webp`)
      
      await downloadFileFake(redirectUrl, videoPath)
      execSync(`ffmpeg -y -i "${videoPath}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
      
      const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      
      if (!webpUrl) {
        throw new Error("Upload attachment thất bại - không nhận được URL")
      }
      
      await api.sendCustomSticker(message, webpUrl + "?createdBy=VXK-Service-BOT.Webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
      
      await deleteFile(videoPath)
      await deleteFile(webpPath)
    } else {
      const fileExt = await checkExstentionFileRemote(mediaUrl)
      const imagePath = path.join(tempDir, `sticker_${Date.now()}.${fileExt}`)
      
      await downloadFileFake(mediaUrl, imagePath)
      
      const imageUpload = await api.uploadAttachment([imagePath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const imageUrl = imageUpload?.[0]?.fileUrl
      
      if (!imageUrl) {
        throw new Error("Upload attachment thất bại - không nhận được URL")
      }
      
      await api.sendCustomSticker(message, imageUrl + "?createdBy=VXK-Service-BOT.Webp", imageUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
      
      await deleteFile(imagePath)
    }
    
    return true
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error)
    throw error
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  
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
    
    await sendMessageWarning(api, message, `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
