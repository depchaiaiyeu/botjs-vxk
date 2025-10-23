import { spawn, exec } from "child_process"
import path from "path"
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js"

let botProcess

function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, shell: "/bin/bash", maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message))
      resolve(stdout || stderr)
    })
  })
}

async function autoCommit() {
  try {
    const repoPath = path.resolve(process.cwd())
    await runCommand('git config --global user.email "action@github.com"', repoPath)
    await runCommand('git config --global user.name "Railway Bot"', repoPath)

    const excludeList = [
      "node_modules",
      "package-lock.json",
      "logs/message.json",
      "logs/message.txt",
      "*.txt",
      "*.log",
      "*.cache",
      "*.zip",
      "*.rar",
      ".gitignore"
    ]
    const excludeArgs = excludeList.map(x => `:(exclude)${x}`).join(" ")
    await runCommand(`git add . ${excludeArgs}`, repoPath)

    const diff = await runCommand("git diff --staged --quiet || echo changed", repoPath)
    if (!diff.includes("changed")) return console.log("No changes to commit")

    await runCommand('git commit -m "Auto commit changes"', repoPath)

    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) return console.log("Missing GITHUB_TOKEN in Railway Variables")

    const repoName = process.env.RAILWAY_GIT_REPO || path.basename(repoPath)
    const remoteUrl = `https://Xuankiendev:${githubToken}@github.com/Xuankiendev/${repoName}.git`
    await runCommand(`git remote set-url origin "${remoteUrl}"`, repoPath)

    try {
      await runCommand("git push origin main", repoPath)
      console.log("✅ Auto commit & push done")
    } catch (err) {
      if (err.message.includes("fetch first") || err.message.includes("rejected")) {
        console.log("⚠️ Push rejected, pulling latest changes...")
        await runCommand("git fetch origin main", repoPath)
        await runCommand("git rebase origin/main", repoPath)
        await runCommand("git push origin main", repoPath)
        console.log("✅ Auto commit after rebase done")
      } else {
        throw err
      }
    }
  } catch (e) {
    console.error("❌ Auto commit failed:", e.message)
  }
}

function startBot() {
  botProcess = spawn("npm", ["start"], { detached: true, stdio: "ignore" })
  attachBotEvents(botProcess)
  botProcess.unref()
  logManagerBot("Bot started")
  console.log("Bot started")
}

function stopBot() {
  if (botProcess && botProcess.pid) {
    try {
      process.kill(-botProcess.pid)
      logManagerBot("Bot stopped")
      console.log("Bot stopped")
    } catch (err) {
      logManagerBot(`Failed to stop bot: ${err.message}`)
      console.log("Failed to stop bot:", err.message)
    }
  } else {
    logManagerBot("Failed to stop bot: invalid PID")
    console.log("Failed to stop bot: invalid PID")
  }
}

function restartBot() {
  stopBot()
  setTimeout(() => {
    startBot()
    logManagerBot("Bot restarted")
    console.log("Bot restarted")
  }, 1000)
}

function attachBotEvents(botProcess) {
  botProcess.on("error", (err) => {
    logManagerBot(`Bot error: ${err.message}`)
    restartBot()
  })
  botProcess.on("exit", (code) => {
    logManagerBot(`Bot exited: ${code}`)
    restartBot()
  })
}

async function main() {
  ensureLogFiles()
  startBot()
  setInterval(autoCommit, 5 * 60 * 1000) // 5 phút
  process.on("SIGINT", () => restartBot())
  process.on("SIGTERM", () => restartBot())
  process.on("exit", () => setTimeout(startBot, 1000))
}

main()
