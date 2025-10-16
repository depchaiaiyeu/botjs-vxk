import axios from "axios";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle } from "../../api-zalo/index.js";
import pkg from 'pg';
const { Pool } = pkg;

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "12";
export const IS_BOLD = true;

const GITHUB_TOKEN = "";
const GITHUB_USERNAME = "depchaiaiyeu";
const SOURCE_REPO = "BOT-JS1.6.0";
const WORKFLOW_REPO = "vps";

const pool = new Pool({
  connectionString: "",
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS mybots (
        id SERIAL PRIMARY KEY,
        repo_name VARCHAR(255) UNIQUE NOT NULL,
        admin_ids TEXT NOT NULL,
        name_server VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'running',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    client.release();
  }
}

initDatabase();

async function forkRepository(newRepoName) {
  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${SOURCE_REPO}/forks`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  
  const response = await axios.post(
    url,
    { name: newRepoName },
    { headers }
  );
  
  return response.data;
}

async function updateFile(repo, path, content, message) {
  const getUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  let sha;
  try {
    const getResponse = await axios.get(getUrl, { headers });
    sha = getResponse.data.sha;
  } catch (error) {
    sha = null;
  }

  const updateUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${repo}/contents/${path}`;
  const encodedContent = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  
  const payload = {
    message: message,
    content: encodedContent,
  };
  
  if (sha) {
    payload.sha = sha;
  }

  await axios.put(updateUrl, payload, { headers });
}

async function createWorkflowFile(adminId, repoName) {
  const workflowContent = `name: Run Bot
on:
  workflow_dispatch:
  schedule:
    - cron: "30 * * * *"
jobs:
  run-bot:
    runs-on: ubuntu-latest
    steps:
      - name: Clone Repository
        run: git clone https://github.com/${GITHUB_USERNAME}/${repoName}
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20
      - name: Install FFmpeg
        run: sudo apt-get update && sudo apt-get install -y ffmpeg
        
      - name: Install dependencies & replace nsfwjs
        run: |
          cd ${repoName}
          npm install
          rm -rf node_modules/nsfwjs
          cp -r nsfwjs.u node_modules/nsfwjs
      - name: Run bot
        run: |
          cd ${repoName}
          node bot.js`;

  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${WORKFLOW_REPO}/contents/.github/workflows/${adminId}.yml`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const encodedContent = Buffer.from(workflowContent).toString("base64");
  
  await axios.put(
    url,
    {
      message: `Create workflow for bot ${adminId}`,
      content: encodedContent,
    },
    { headers }
  );
}

async function deleteWorkflowFile(adminId) {
  const getUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${WORKFLOW_REPO}/contents/.github/workflows/${adminId}.yml`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const getResponse = await axios.get(getUrl, { headers });
    const sha = getResponse.data.sha;

    await axios.delete(getUrl, {
      headers,
      data: {
        message: `Delete workflow for bot ${adminId}`,
        sha: sha,
      },
    });
  } catch (error) {
    console.error("Error deleting workflow file:", error.message);
  }
}

async function deleteRepository(repoName) {
  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  await axios.delete(url, { headers });
}

export async function handleMyBotCommand(api, message) {
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  const content = message.data?.content?.trim();

  if (!content) {
    await sendMessageStateQuote(
      api,
      message,
      "Vui lòng nhập lệnh hợp lệ",
      false,
      30000
    );
    return;
  }

  const parts = content.split(" ");
  const command = parts[1];

  try {
    if (command === "create") {
      if (parts.length < 6) {
        await sendMessageStateQuote(
          api,
          message,
          "Cú pháp: mybot create <imei> <cookie> <adminId;adminId> <nameServer>",
          false,
          30000
        );
        return;
      }

      const imei = parts[2];
      const cookieStr = parts[3];
      const adminIds = parts[4].split(";");
      const nameServer = parts[5];
      const repoName = adminIds[0];

      await sendMessageStateQuote(
        api,
        message,
        `🔄 Đang tạo bot...`,
        false,
        30000
      );

      await forkRepository(repoName);
      await new Promise((resolve) => setTimeout(resolve, 5000));

      let cookieObj;
      try {
        cookieObj = JSON.parse(cookieStr);
      } catch (error) {
        await sendMessageStateQuote(
          api,
          message,
          "❌ Cookie không hợp lệ, vui lòng nhập đúng định dạng JSON",
          false,
          30000
        );
        return;
      }

      const configData = {
        cookie: cookieObj,
        imei: imei,
        userAgent: "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
      };

      await updateFile(
        repoName,
        "assets/config.json",
        configData,
        "Update config.json"
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const databaseConfig = {
        nameServer: nameServer,
      };

      await updateFile(
        repoName,
        "assets/data-json/database-config.json",
        databaseConfig,
        "Update database-config.json"
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const adminListData = {
        adminId: adminIds,
      };

      await updateFile(
        repoName,
        "assets/data/list_admin.json",
        adminListData,
        "Update list_admin.json"
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await createWorkflowFile(adminIds[0], repoName);

      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO mybots (repo_name, admin_ids, name_server, status) 
           VALUES ($1, $2, $3, $4)`,
          [repoName, adminIds.join(";"), nameServer, "running"]
        );
      } finally {
        client.release();
      }

      const successMsg = `✅ Tạo bot thành công!\n👥 Admin IDs: ${adminIds.join(", ")}\n🖥️ Server: ${nameServer}\n\n⏳ Vui lòng đợi 5-10 phút để bot hoàn thành khởi động.`;
      const styleSuccess = MultiMsgStyle([
        MessageStyle(0, successMsg.length, COLOR_GREEN, SIZE_16, IS_BOLD),
      ]);

      await api.sendMessage(
        {
          msg: successMsg,
          style: styleSuccess,
          ttl: 300000,
        },
        threadId,
        message.type
      );
    } else if (command === "list") {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM mybots ORDER BY id ASC`
        );

        if (result.rows.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            "📋 Danh sách bot trống",
            false,
            30000
          );
          return;
        }

        const messages = [];
        result.rows.forEach((bot, index) => {
          let msg = `${index + 1}. 👥 Admin: ${bot.admin_ids.replace(/;/g, ", ")} | 🖥️ Server: ${bot.name_server} | 🔴 Status: ${bot.status}`;
          const style = MultiMsgStyle([
            MessageStyle(0, msg.length, COLOR_GREEN, SIZE_16, IS_BOLD),
          ]);
          messages.push({ msg, style });
        });

        for (const msgData of messages) {
          await api.sendMessage(
            {
              msg: msgData.msg,
              style: msgData.style,
              ttl: 300000,
            },
            threadId,
            message.type
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } finally {
        client.release();
      }
    } else if (command === "stop") {
      if (parts.length < 3) {
        await sendMessageStateQuote(
          api,
          message,
          "Cú pháp: mybot stop [index]",
          false,
          30000
        );
        return;
      }

      const index = parseInt(parts[2]);
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM mybots ORDER BY id ASC LIMIT 1 OFFSET $1`,
          [index - 1]
        );

        if (result.rows.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            "❌ Index không hợp lệ",
            false,
            30000
          );
          return;
        }

        await client.query(
          `UPDATE mybots SET status = 'stopped' WHERE id = $1`,
          [result.rows[0].id]
        );

        await sendMessageStateQuote(
          api,
          message,
          `⏸️ Đã dừng bot`,
          false,
          30000
        );
      } finally {
        client.release();
      }
    } else if (command === "remove") {
      if (parts.length < 3) {
        await sendMessageStateQuote(
          api,
          message,
          "Cú pháp: mybot remove [index]",
          false,
          30000
        );
        return;
      }

      const index = parseInt(parts[2]);
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM mybots ORDER BY id ASC LIMIT 1 OFFSET $1`,
          [index - 1]
        );

        if (result.rows.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            "❌ Index không hợp lệ",
            false,
            30000
          );
          return;
        }

        const bot = result.rows[0];

        await sendMessageStateQuote(
          api,
          message,
          `🗑️ Đang xóa bot...`,
          false,
          30000
        );

        const adminIds = bot.admin_ids.split(";");
        
        await deleteWorkflowFile(adminIds[0]);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await cancelWorkflowRuns(bot.repo_name);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await deleteRepository(bot.repo_name);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await client.query(`DELETE FROM mybots WHERE id = $1`, [bot.id]);

        await sendMessageStateQuote(
          api,
          message,
          `✅ Đã xóa bot, workflow và repository hoàn toàn`,
          false,
          30000
        );
      } finally {
        client.release();
      }
    } else {
      await sendMessageStateQuote(
        api,
        message,
        "❌ Lệnh không hợp lệ. Sử dụng: create, list, stop, remove",
        false,
        30000
      );
    }
  } catch (error) {
    console.error("Lỗi mybot command:", error.message);
    await sendMessageStateQuote(
      api,
      message,
      `❌ Lỗi: ${error.message}`,
      false,
      30000
    );
  }
    }
