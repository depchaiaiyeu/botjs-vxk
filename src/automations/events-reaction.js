import { handleReactionConfirmJoinGroup } from "../commands/bot-manager/remote-action-group.js";
import { handleTikTokReaction } from "../service-hahuyhoang/api-crawl/tiktok/tiktok-service.js";
import { handleAdminReactionDelete } from "../commands/bot-manager/recent-message.js";

export async function reactionEvents(api, reaction) {
  if (await handleReactionConfirmJoinGroup(api, reaction)) return;
  if (await handleTikTokReaction(api, reaction)) return;
  if (await handleAdminReactionDelete(api, reaction)) return;
)
