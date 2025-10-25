import { handleReactionConfirmJoinGroup } from "../commands/bot-manager/remote-action-group.js";
import { handleTikTokReaction } from "../service-hahuyhoang/api-crawl/tiktok/tiktok-service.js";
import { handleAdminReactionDelete } from "../commands/bot-manager/recent-message.js";
import { handlePVPConfirmation } from "../service-hahuyhoang/game-service/mini-game/wordChain.js";
//Xử Lý Sự Kiện Reaction
export async function reactionEvents(api, reaction) {
  if (await handleReactionConfirmJoinGroup(api, reaction)) return;
  if (await handleTikTokReaction(api, reaction)) return;
  if (await handleAdminReactionDelete(api, reaction)) return;
  if (await handlePVPConfirmation(api,reaction)) return;
}
