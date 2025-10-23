import fs from "fs"
import path from "path"
import { getGlobalPrefix, setGlobalPrefix } from "../../service-hahuyhoang/service.js"
import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js"

const commandConfigPath = path.join(process.cwd(), "assets", "json-data", "command.json")

export async function handlePrefixCommand(api, message, threadId, isAdmin) {
  const content = message.data.content.trim()
  const currentPrefix = getGlobalPrefix()
  if (!content.startsWith(`${currentPrefix}prefix`) && !content.startsWith("prefix")) return false
  const args = content.slice(content.startsWith(currentPrefix) ? currentPrefix.length + 6 : 6).trim()
  if (!args) {
    if (!isAdmin) return true
    await sendMessageFromSQL(api, message, { message: `Prefix hiện tại của bot là: ${currentPrefix === "" ? "  " : currentPrefix}`, success: true }, true, 30000)
    return true
  }
  if (!isAdmin) return true
  if (args.includes(" ")) {
    await sendMessageQuery(api, message, "Prefix không được chứa khoảng trắng!")
    return true
  }
  const newPrefix = args.toLowerCase() === "none" ? "" : args
  try {
    const config = JSON.parse(fs.readFileSync(commandConfigPath, "utf8"))
    config.prefix = newPrefix
    fs.writeFileSync(commandConfigPath, JSON.stringify(config, null, 2))
    setGlobalPrefix(newPrefix)
    await sendMessageFromSQL(api, message, { message: `Prefix của bot đã được cập nhật!\nPrefix mới là: ${newPrefix === "" ? "  " : newPrefix}`, success: true }, true, 60000)
  } catch (error) {
    console.error("Lỗi khi cập nhật prefix:", error)
    await sendMessageFailed(api, message, "Đã xảy ra lỗi khi thay đổi prefix!")
  }
  return true
}
