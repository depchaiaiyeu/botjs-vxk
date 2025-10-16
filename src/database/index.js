import mysql from "mysql2/promise";
import { createDB } from "mysql-memory-server";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";

export * from "./player.js";
export * from "./jdbc.js";

let nameServer = "";
let connection;
let NAME_TABLE_PLAYERS;
let NAME_TABLE_ACCOUNT;
let DAILY_REWARD;
let embeddedDB = null;

async function loadConfig() {
  const configPath = path.join(
    process.cwd(),
    "assets",
    "json-data",
    "database-config.json"
  );
  const configFile = await fs.readFile(configPath, "utf8");
  return JSON.parse(configFile);
}

export async function getNameServer() {
  const config = await loadConfig();
  return config.nameServer;
}

export function updateNameServer(newName) {
  nameServer = newName;
}

async function checkMySQLConnection(config) {
  try {
    const testConnection = await mysql.createConnection({
      host: config.host || "127.0.0.1",
      user: config.user || "root",
      password: config.password || "",
      port: config.port || 3306,
      connectTimeout: 3000,
    });
    await testConnection.end();
    return true;
  } catch (error) {
    return false;
  }
}

async function createEmbeddedMySQL(config) {
  console.log(chalk.yellow("MySQL server not found. Creating embedded instance..."));
  
  try {
    embeddedDB = await createDB({
      version: config.mysqlVersion || "8.4.x",
      dbName: config.database || "game_db",
      username: config.user || "root",
      port: config.port || 0,
      downloadBinaryOnce: true,
      logLevel: "ERROR",
    });

    console.log(chalk.green(`Embedded MySQL created successfully on port ${embeddedDB.port}`));

    return {
      host: "127.0.0.1",
      user: embeddedDB.username,
      password: "",
      port: embeddedDB.port,
      database: embeddedDB.dbName,
    };
  } catch (error) {
    console.error(chalk.red("Failed to create embedded MySQL:"), error.message);
    throw error;
  }
}

export async function initializeDatabase() {
  try {
    const config = await loadConfig();

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    const isConnected = await checkMySQLConnection(config);

    let dbConfig = config;
    
    if (!isConnected) {
      const embeddedConfig = await createEmbeddedMySQL(config);
      dbConfig = { ...config, ...embeddedConfig };
    }

    const tempConnection = await mysql.createConnection({
      host: dbConfig.host || "127.0.0.1",
      user: dbConfig.user || "root",
      password: dbConfig.password || "",
      port: dbConfig.port || 3306,
    });

    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
    );

    await tempConnection.end();

    connection = mysql.createPool({
      host: dbConfig.host || "127.0.0.1",
      user: dbConfig.user || "root",
      password: dbConfig.password || "",
      database: dbConfig.database,
      port: dbConfig.port || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const [tablesAccount] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_ACCOUNT}'`
    );
    
    if (tablesAccount.length === 0) {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ${NAME_TABLE_ACCOUNT} (
          id INT PRIMARY KEY AUTO_INCREMENT,
          username VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          is_admin BOOLEAN DEFAULT false,
          vnd BIGINT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log(`Table ${NAME_TABLE_ACCOUNT} created`);
    }

    const [tables] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_PLAYERS}'`
    );

    if (tables.length === 0) {
      await connection.execute(`
        CREATE TABLE ${NAME_TABLE_PLAYERS} (
          id INT AUTO_INCREMENT,
          username VARCHAR(255) NOT NULL,
          idUserZalo VARCHAR(255) DEFAULT '-1',
          playerName VARCHAR(255) NOT NULL,
          balance BIGINT DEFAULT 10000,
          registrationTime DATETIME,
          totalWinnings BIGINT DEFAULT 0,
          totalLosses BIGINT DEFAULT 0,
          netProfit BIGINT DEFAULT 0,
          totalWinGames BIGINT DEFAULT 0,
          totalGames BIGINT DEFAULT 0,
          winRate DECIMAL(5, 2) DEFAULT 0,
          lastDailyReward DATETIME,
          isBanned BOOLEAN DEFAULT FALSE,
          PRIMARY KEY (id),
          UNIQUE KEY (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log(`Table ${NAME_TABLE_PLAYERS} created`);
    } else {
      const [columns] = await connection.execute(
        `SHOW COLUMNS FROM ${NAME_TABLE_PLAYERS}`
      );
      const existingColumns = columns.map((col) => col.Field);

      const requiredColumns = [
        {
          name: "username",
          query: "ADD COLUMN username VARCHAR(255) NOT NULL UNIQUE",
        },
        {
          name: "idUserZalo",
          query: "ADD COLUMN idUserZalo VARCHAR(255) DEFAULT '-1'",
        },
        {
          name: "playerName",
          query: "ADD COLUMN playerName VARCHAR(255) NOT NULL",
        },
        {
          name: "balance",
          query: "ADD COLUMN balance bigint(20) DEFAULT 10000",
        },
        {
          name: "registrationTime",
          query: "ADD COLUMN registrationTime DATETIME",
        },
        {
          name: "totalWinnings",
          query: "ADD COLUMN totalWinnings bigint(20) DEFAULT 0",
        },
        {
          name: "totalLosses",
          query: "ADD COLUMN totalLosses bigint(20) DEFAULT 0",
        },
        {
          name: "netProfit",
          query: "ADD COLUMN netProfit bigint(20) DEFAULT 0",
        },
        {
          name: "totalWinGames",
          query: "ADD COLUMN totalWinGames bigint(20) DEFAULT 0",
        },
        {
          name: "totalGames",
          query: "ADD COLUMN totalGames bigint(20) DEFAULT 0",
        },
        {
          name: "winRate",
          query: "ADD COLUMN winRate DECIMAL(5, 2) DEFAULT 0",
        },
        {
          name: "lastDailyReward",
          query: "ADD COLUMN lastDailyReward DATETIME",
        },
        {
          name: "isBanned",
          query: "ADD COLUMN isBanned BOOLEAN DEFAULT FALSE",
        },
      ];

      for (const column of requiredColumns) {
        if (!existingColumns.includes(column.name)) {
          await connection.execute(
            `ALTER TABLE ${NAME_TABLE_PLAYERS} ${column.query}`
          );
          console.log(`Column ${column.name} added to ${NAME_TABLE_PLAYERS}`);
        }
      }
    }

    console.log(chalk.green("Database initialized successfully"));
  } catch (error) {
    console.error(chalk.red("Database initialization failed:"), error.message);
    throw error;
  }
}

export async function closeDatabase() {
  if (connection) {
    await connection.end();
  }
  if (embeddedDB) {
    await embeddedDB.stop();
  }
}

process.on("SIGINT", async () => {
  await closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDatabase();
  process.exit(0);
});

export {
  connection,
  NAME_TABLE_PLAYERS,
  NAME_TABLE_ACCOUNT,
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  nameServer,
  DAILY_REWARD,
};
