import axios from "axios"
import fs from "fs"
import path from "path"
import { getGlobalPrefix } from "../../../service.js"
import { checkExstentionFileRemote, deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { removeMention } from "../../../../utils/format-util.js"
import { isAdmin } from "../../../../index.js"
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

export async function processAndSendSticker(api, message, mediaUrl, width, height) {
  const threadId = message.threadId
  let pathSticker = path.join(tempDir, `sticker_${Date.now()}.tmp`)
  
  try {
    await downloadFileFake(mediaUrl, pathSticker)
    const linkUploadZalo = await api.uploadAttachment([pathSticker], threadId, appContext.send2meId, MessageType.DirectMessage)
    const finalUrl = linkUploadZalo[0].fileUrl + "?createdBy=VXK-Service-BOT.Webp"
    await api.sendCustomSticker(message, finalUrl, finalUrl, width, height)
    return true
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error)
    throw error
  } finally {
    await deleteFile(pathSticker)
  }
}



export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const senderId = message.data.uidFrom
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
    
    const width = params.width || 512
    const height = params.height || 512
    
    await sendMessageWarning(api, message, `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`, true)
    await processAndSendSticker(api, message, decodedUrl, width, height)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
