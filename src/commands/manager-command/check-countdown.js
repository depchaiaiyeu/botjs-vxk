import schedule from 'node-schedule';
import fs from 'fs/promises';
import path from 'path';

const countdownJobs = new Map();
const groupSettingsPath = path.resolve('./assets/data/group_settings.json');

async function isBotActive(threadId) {
    try {
        const data = await fs.readFile(groupSettingsPath, 'utf-8');
        const groupSettings = JSON.parse(data);
        return groupSettings[threadId]?.activeBot === true;
    } catch (error) {
        console.error('Lỗi đọc group_settings.json:', error);
        return false;
    }
}

export async function sendReactionWaitingCountdown(api, message, count) {
    const messages = Array(count).fill(message);
    const messageId = message.data.cliMsgId || Date.now().toString();
    const threadId = message.threadId || message.data?.threadId;

    const isActive = await isBotActive(threadId);
    if (!isActive) {
        return;
    }

    const date = new Date(Date.now() + 300);
    const job = schedule.scheduleJob(date, async () => {
        try {
            while (messages.length > 0) {
                try {
                    await api.addReaction("CLOCK", messages);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await api.addReaction("UNDO", messages);
                } catch (error) {
                }
                messages.splice(0, 1);
            }
        } catch (error) {
            console.error(`Error in countdown job ${messageId}:`, error);
        } finally {
            job.cancel();
            countdownJobs.delete(messageId);
        }
    });
    
    countdownJobs.set(messageId, job);
}
