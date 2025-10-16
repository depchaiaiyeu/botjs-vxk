import { handleReactionConfirmJoinGroup } from "../commands/bot-manager/remote-action-group.js";
import { handleTikTokReaction } from "../service-hahuyhoang/api-crawl/tiktok/tiktok-service.js";

export async function reactionEvents(api, reaction) {
  if (await handleReactionConfirmJoinGroup(api, reaction)) return;
  const message = {
    threadId: reaction.threadId,
    type: reaction.type,
    uid
  };
  if (await handleTikTokReaction(api, reaction, message)) return;
}
