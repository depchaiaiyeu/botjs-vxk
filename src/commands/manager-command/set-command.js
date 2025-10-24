import { getCommandConfig } from "../../index.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { writeCommandConfig } from "../../utils/io-json.js";
import { sendMessageWarning, sendMessageComplete, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

const permissionMap = {
    1: {
        key: "all",
        name: "Tất Cả Người Dùng",
    },
    2: {
        key: "adminBox",
        name: "Trưởng / Phó Cộng Đồng",
    },
    3: {
        key: "adminBot",
        name: "Quản Trị Bot",
    },
    4: {
        key: "adminLevelHigh",
        name: "Quản Trị Cấp Cao",
    },
};

export function getPermissionCommandName(command) {
    const permission = Object.values(permissionMap).find((p) => p.key === command.permission);
    return permission ? permission.name : "Tất Cả Người Dùng";
}

export async function handleSetCommandActive(api, message, commandParts) {
    const commandConfig = getCommandConfig();
    const prefix = getGlobalPrefix();

    if (commandParts.length < 3) {
        await sendMessageWarning(
            api,
            message,
            `Vui lòng nhập đúng cú pháp:\n${prefix}setcmd on/off <tên_lệnh> - Bật/tắt lệnh\n${prefix}setcmd p <tên_lệnh> <level> - Đặt quyền hạn lệnh (1-4)\n${prefix}setcmd cd <tên_lệnh> <giây> - Đặt thời gian chờ lệnh`,
            false
        );
        return;
    }

    const action = commandParts[1].toLowerCase();
    const cmdName = commandParts[2].toLowerCase();
    const command = commandConfig.commands.find(cmd => cmd.name === cmdName);

    if (!command) {
        await sendMessageFailed(
            api,
            message,
            `Không tìm thấy lệnh "${cmdName}"`,
            false
        );
        return;
    }

    switch (action) {
        case "on":
        case "off":
            const newActive = action === "on";
            command.active = newActive;
            writeCommandConfig(commandConfig);
            await sendMessageComplete(
                api,
                message,
                `Đã ${newActive ? "bật" : "tắt"} lệnh "${cmdName}"`,
                false
            );
            break;

        case "p":
            if (commandParts.length < 4) {
                await sendMessageWarning(
                    api,
                    message,
                    "Vui lòng nhập level quyền hạn (1-4):\n1: all (Tất cả)\n2: adminBox (Quản trị viên nhóm)\n3: adminBot (Quản trị viên bot)\n4: adminLevelHigh (Quản trị viên cấp cao)",
                    false
                );
                return;
            }

            const permissionLevel = parseInt(commandParts[3]);
            const newPermissionObj = permissionMap[permissionLevel];

            if (!newPermissionObj) {
                await sendMessageFailed(
                    api,
                    message,
                    "Level quyền hạn không hợp lệ. Vui lòng chọn từ 1-4:\n" +
                        Object.entries(permissionMap)
                            .map(([level, { key, name }]) => `${level}: ${key} (${name})`)
                            .join("\n"),
                    false
                );
                return;
            }

            command.permission = newPermissionObj.key;
            writeCommandConfig(commandConfig);
            await sendMessageComplete(
                api,
                message,
                `Đã thay đổi quyền hạn của lệnh "${cmdName}":\n- Quyền hạn mới: ${newPermissionObj.name}`,
                false
            );
            break;

        case "cd":
            if (commandParts.length < 4) {
                await sendMessageWarning(
                    api,
                    message,
                    `Vui lòng nhập thời gian chờ (tính bằng giây)`,
                    false
                );
                return;
            }

            const newCountdown = parseInt(commandParts[3]);
            if (isNaN(newCountdown) || newCountdown < 0) {
                await sendMessageFailed(
                    api,
                    message,
                    "Thời gian countdown phải là số nguyên dương",
                    false
                );
                return;
            }

            const oldCountdown = command.countdown || 0;
            command.countdown = newCountdown;
            writeCommandConfig(commandConfig);
            await sendMessageComplete(
                api,
                message,
                `Đã cập nhật thời gian chờ của lệnh "${cmdName}":\n- Cũ: ${oldCountdown}s\n- Mới: ${newCountdown}s`,
                false
            );
            break;

        default:
            await sendMessageFailed(
                api,
                message,
                `Hành động không hợp lệ. Vui lòng sử dụng:\n- on/off: Bật/tắt lệnh\n- p: Đặt quyền hạn\n- cd: Đặt thời gian chờ`,
                false
            );
            break;
    }
}
