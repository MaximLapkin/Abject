require('dotenv').config()
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear, GoalFollow } = goals;
const collectBlock = require('mineflayer-collectblock').plugin;
const toolPlugin = require('mineflayer-tool').plugin;
const { plugin: pvp } = require('mineflayer-pvp');
const armorManager = require('mineflayer-armor-manager');
const plasmo = require("mineflayer-plasmovoice")
const vec3 = require('vec3');
const movement = require("mineflayer-movement")
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const WATCHED_PLAYERS = ['vlkardakov', 'monoplan', 'Rusvanplay'];
const RANGE_GOAL = 0;
let protectedPlayer = null;
let following = false;
let miningSand = false;
let followingProtectedPlayer = false;
let collecting = false;
let collectingId = null
let task = null;
let isInitialSpawn = true;
let collecting_paused = false
let mcData;
let isEating = false;
let containerMemory = []
const EAT_THRESHOLD = 16;
let MODE = 'мирный';
let SOUND = null;
let defaultMove
let playing = false;

const SPAWN_POSITIONS = [
    new vec3(-8, 87, -2),
    new vec3(16, 87, -15),
    new vec3(4, 87, -23),
    new vec3(-9, 94, -25),
    new vec3(0, 94, -17),
    new vec3(3, 97, -6),
    new vec3(1, 87, 12),
    new vec3(-23, 86, -8),
    new vec3(-32, 86, -16),
    new vec3(-32, 86, 9),
    new vec3(-32, 86, 15),
    new vec3(-17, 86, 8),
    new vec3(-17, 86, 18),
    new vec3(11, 87, 6),
    new vec3(26, 87, 23),
    new vec3(41, 87, 24),
    new vec3(30, 86, 11),
    new vec3(-24, 89, 1),
    new vec3(-16, 86, -14),
    new vec3(-19, 91, -15),
    new vec3(-7, 87, -18),
    new vec3(3, 87, -17),
    new vec3(2, 87, 4),
    new vec3(-25, 91, 18),
    new vec3(-19, 94, 18),
    new vec3(-29, 100, 14),
    new vec3(-39, 97, 3),
    new vec3(-1, 92, 0),
    new vec3(-9, 90, -2),
    new vec3(-15, 88, 0),
    new vec3(-24, 90, -8),
    new vec3(-31, 89, 1),
    new vec3(-38, 87, 0),
    new vec3(-24, 89, 9),
    new vec3(-4, 93, -14),
    new vec3(18, 90, -6)
];


const BOT_USERNAME = process.env.BOT_USERNAME
const PASSWORD = process.env.PASSWORD
const NUMBER = parseInt(process.env.NUMBER)

console.log('----------------')
console.log('Сведения о боте:')
console.log("Имя: ", BOT_USERNAME)
console.log("Пароль: ", PASSWORD)
console.log("Порядковый номер: ", NUMBER)
console.log('----------------')

const bot = mineflayer.createBot({
    host: '212.80.7.178',
    port: 25565,
    username: BOT_USERNAME,
    auth: 'offline',
    version: '1.17'
});

console.log("Запуск бота...");

bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);
bot.loadPlugin(collectBlock);
bot.loadPlugin(toolPlugin);
bot.loadPlugin(movement.plugin)
bot.loadPlugin(plasmo.plugin)

function findFood(botInstance) {
    if (!mcData || !mcData.foods) {
        console.error("mcData или mcData.foods не загружены!");
        return null;
    }
    return botInstance.inventory.items().find(item => mcData.foods[item.type]);
}
async function stealItems(itemName, user_name) {
    const containers = containerMemory;
    if (containers.length === 0) {
        bot.chat("память пустая.");
        return;
        return;
    }

    bot.chat(`вижу ${containers.length} контейнеров, ща чекну чё в них`);

    for (const container of containers) {
        const { name, x, y, z, items } = container;

        const relevantItems = items.filter(item => item.name.toLowerCase().includes(itemName.toLowerCase()));

        if (relevantItems.length > 0) {
//            bot.chat(`Нашел подходящие предметы в контейнере ${name} (${x}, ${y}, ${z}), иду забирать!`);

            try {
                await bot.pathfinder.goto(new GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), 4));
//                await new Promise(res => setTimeout(res, 50));

                const block = bot.blockAt(new vec3(Math.floor(x), Math.floor(y), Math.floor(z)));
                if (!block) continue;

                const chest = await bot.openContainer(block);

                const removedItems = [];

                for (const item of chest.containerItems()) {
                    if (item.name.toLowerCase().includes(itemName.toLowerCase())) {
                        try {
                            await chest.withdraw(item.type, null, item.count);
                            console.log(`украл ${item.name} x${item.count}`);
                            removedItems.push(item);
                        } catch (err) {
                            console.log(`не смог забрать ${item.name}:`, err.message);
                        }
                    }
                }

                chest.close();

                container.items = container.items.filter(item => !removedItems.includes(item));

//                bot.chat(`Удалил ${removedItems.length} предметов из контейнера ${name}`);
            } catch (err) {
                console.log(`ошибка у ${name} в позиции (${x}, ${y}, ${z}):`, err.message);
            }
        } else {
            console.log(`В контейнере ${name} нет подходящих предметов.`);
        }
    }

    const target = bot.players[user_name]?.entity;
    if (!target) {
        bot.chat(`не вижу игрока ${user_name}, лут при мне 😏`);
        return;
    }

//    bot.chat(`иду к ${username} с лутом`);
    await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 2));

    const items = bot.inventory.items();
    for (const item of items) {
        try {
            await bot.toss(item.type, null, item.count);
//            bot.chat(`выкинул ${item.name} x${item.count}`);
        } catch (err) {
            console.log(`не смог скинуть ${item.name}:`, err.message);
        }
    }

    bot.chat("всё скинул, чекни!");
}
async function autoEat() {
    if (isEating || !mcData) return;

    if (bot.food <= EAT_THRESHOLD) {
        const food = findFood(bot);
        if (food) {
            console.log(`[АвтоЕда] Голод ${bot.food}/${bot.foodSaturation}. Найдена еда: ${food.name}. Начинаю есть.`);
            isEating = true;
            try {
                await bot.equip(food, 'hand');
                console.log(`[АвтоЕда] Взял ${food.name} в руку.`);
                await bot.consume();
                console.log(`[АвтоЕда] Поел ${food.name}.`);
            } catch (err) {
                console.error(`[АвтоЕда] Ошибка во время еды: ${err.message}`);
                try { await bot.unequip('hand'); } catch (unequipErr) {/* Игнорируем */}
            } finally {
                isEating = false;
            }
        } else {
            console.log(`[АвтоЕда] Голод ${bot.food}/${bot.foodSaturation}, но еды в инвентаре нет.`);
            // bot.chat(`/msg ${WATCHED_PLAYERS[0]} Дайте едыыы..`)
        }
    }
}
function initializeBotState() {
    // console.log("Инициализация состояния бота...");
    try {
        mcData = require('minecraft-data')(bot.version);
        if (!mcData) {
            console.error("Не удалось загрузить mcData для версии:", bot.version);

            return;
        }

        // console.log(`[mcData] Загружены данные для Minecraft ${bot.version}. Генерирую карту Protocol ID -> Item Name...`);
        itemProtocolIdMap = {};

        const itemsById = mcData.items;

        if (!itemsById) {
            // console.error("[mcData] Ошибка: Свойство 'items' отсутствует в mcData. Не могу создать карту ID.");
        } else {
            for (const protocolIdStr in itemsById) {
                if (Object.prototype.hasOwnProperty.call(itemsById, protocolIdStr)) {
                    const itemInfo = itemsById[protocolIdStr];
                    const numericProtocolId = parseInt(protocolIdStr, 10);

                    if (!isNaN(numericProtocolId) && itemInfo && itemInfo.name) {
                        itemProtocolIdMap[numericProtocolId] = itemInfo.name;
                    } else {
                        // console.warn(`[mcData] Пропуск некорректной записи предмета: ID='${protocolIdStr}', Info=`, itemInfo);
                    }
                }
            }
            // console.log(`[mcData] Карта Protocol ID -> Item Name создана. Найдено ${Object.keys(itemProtocolIdMap).length} предметов.`);
            // console.log(`[mcData] Проверка: ID 854 = ${itemProtocolIdMap[854]}`);
        }

        defaultMove = new Movements(bot, mcData);

        defaultMove.allow1by1towers = false
        // defaultMove.allowParkour = false
        defaultMove.canPlaceBlocks = false
        defaultMove.scafoldingBlocks = []
        defaultMove.canDig = false


        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(null);

        following = false;
        miningSand = false;
        followingProtectedPlayer = false;
        protectedPlayer = null;
        isEating = false;

        bot.armorManager.equipAll();

        bot.off('health', autoEat);
        bot.on('health', autoEat);

        // console.log("Состояние бота инициализировано.");

    } catch (error) {
        console.error("Ошибка во время инициализации состояния бота:", error);
    }
}
async function breakBlockManually(block) {
    if (!block || !bot.canDigBlock(block)) {
        console.log('Ну тип... не могу сломать этот блок :|');
        return;
    }

    try {
        await bot.tool.equipForBlock(block);
        await bot.dig(block);
        console.log(`Ручками уничтожил ${block.name}`);
    } catch (err) {
        console.log('Шо-то пошло не так при ручном уничтожении: ', err.message);
    }
}
function selectIdsWithName(substring) {
    if (!itemProtocolIdMap || typeof itemProtocolIdMap !== 'object' || typeof substring !== 'string') {
        return [];
    }
    const lowerCaseSubstring = substring.toLowerCase();
    return Object.entries(itemProtocolIdMap)
        .filter(([idStr, itemName]) =>
            typeof itemName === 'string' && itemName.toLowerCase().includes(lowerCaseSubstring)
        )
        .map(([idStr, itemName]) => parseInt(idStr, 10));
}
async function collectBlockType(blockName, count) {
    if (!mcData) {
        console.log('No mcdata')
        miningSand = false;
        return;
    }

    let collected = 0;
    miningSand = true;
    async function mineNext() {
        if (collected >= count) {
            bot.chat(`/msg ${WATCHED_PLAYERS[0]} Завершаю.`);
            miningSand = false;
            task = null
            return;
        }

        const block = bot.findBlock({
            matching: block => {
                const nameMatches = block.name.toLowerCase().includes(blockName.toLowerCase())
                const isVisible = bot.canSeeBlock(block)
                return nameMatches && isVisible
            },
            maxDistance: 20,
            useExtraInfo: true
        })

        if (block) {
            try {
                console.log(`Найден ${blockName} в ${block.position}. Иду добывать...`);

                if (block.name === 'chest' || block.name === 'torch' /* и т.д. */) {
                    await breakBlockManually(block);
                } else {
                    await bot.collectBlock.collect(block);
                }
                collected++;
                console.log(`Добыто ${collected}/${count} ${blockName}.`);
                setTimeout(mineNext, 100);
            } catch (err) {
                bot.chat(`/msg ${WATCHED_PLAYERS[0]} Ошибка: ${err.message}`);
                console.error(`Ошибка collectBlock:`, err);
                miningSand = false;
            }
        } else {
            bot.chat(`/msg ${WATCHED_PLAYERS[0]} Нет.`);
            miningSand = false;
        }
    }

    mineNext();
}
function readFileWithRetry(filePath, maxAttempts = 40, delay = 200) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content !== '') return content;
    } catch (err) {
        console.error(`Ошибка: ${err}`)
        return 'err'
    }
}
function readStates() {
    const directory = path.join('/rusvan-bots', 'states');
    const filesList = [];
    const files = fs.readdirSync(directory);

    files.forEach(filename => {
        if (filename.endsWith('.txt')) {
            const filePath = path.join(directory, filename);
            const content = readFileWithRetry(filePath);

            filesList.push({
                name: path.basename(filename, '.txt'),
                text: content
            });
        }
    });

    return filesList;
}
function getUsedIds() {
    const data = readStates();
    sorted = data
        .filter(obj => obj.name !== BOT_USERNAME)
        .map(obj => obj.text.split(':')[1])
        .filter(id => id !== 'null')
        .map(id => Number(id))
    console.log(sorted)
    return sorted
}
function setState(text) {
    const botUsername = BOT_USERNAME;
    if (!botUsername) {
        console.error("BOT_USERNAME не задан.");
        return;
    }

    const filePath = path.join('/rusvan-bots/states', `${botUsername}.txt`);
    fs.writeFileSync(filePath, text, 'utf8')
    console.log('Файл обновлен!!!')
}
setState(`null`)
console.log(`-----`)
console.log(readStates())
console.log(`-----`)


function findEntityWithName(bot, query, command = 'kill') {
    let targetQuery = query.toLowerCase();

    return bot.nearestEntity(entity => {
        const matchesCriteria = (
            (entity.type === 'player' && entity.username?.toLowerCase().includes(targetQuery)) ||
            (entity.type === 'mob' && entity.mobType?.toLowerCase().includes(targetQuery)) ||
            (entity.name?.toLowerCase().includes(targetQuery)) ||
            (entity.displayName?.toLowerCase().includes(targetQuery))
        );
        return command === 'kill' ? (matchesCriteria && isEntityVisible(entity)) : matchesCriteria;
    });
}
function isEntityVisible(entity) {
    if (!entity || !bot.entity) return false;

    const botEyePosition = bot.entity.position.offset(0, bot.entity.height + 1, 0);
    const targetPosition = entity.position.offset(0, entity.height / 2, 0);
    const distance = botEyePosition.distanceTo(targetPosition);

    if (entity === bot.entity || distance > 128) {
        return false;
    }

    const direction = targetPosition.subtract(botEyePosition).normalize();

    try {
        const blockHit = bot.world.raycast(botEyePosition, direction, distance, (block) => {
            return block.boundingBox !== 'empty' && ![
                'glass', 'leaves', 'chest', 'torch', 'snow_layer'
            ].includes(block.name);
        });

        return blockHit === null;

    } catch (e) {
        console.error(`Ошибка Raycast при проверке видимости ${entity.username || entity.name || entity.mobType}:`, e);
        return false;
    }
}
function isEntityVisibleFromPos(fromPos, entity) {
    if (!entity) return false;

    const targetPosition = entity.position.offset(0, entity.height / 2, 0);
    const distance = fromPos.distanceTo(targetPosition);

    if (distance > 128) {
        return false;
    }

    const direction = targetPosition.subtract(fromPos).normalize();

    try {
        const blockHit = bot.world.raycast(fromPos, direction, distance, (block) => {
            return block.boundingBox !== 'empty' && ![
                'glass', 'leaves', 'chest', 'torch', 'snow_layer'
            ].includes(block.name);
        });

        return blockHit === null;

    } catch (e) {
        console.error(`⚠️ Ошибка Raycast при проверке видимости ${entity.username || entity.name || entity.mobType}:`, e);
        return false;
    }
}

function isItemOnSpawn(itemEntity) {
    if (!itemEntity || !itemEntity.position) return false;
    // console.log("Тестим на видимость!")
    return SPAWN_POSITIONS.some(spawnPos => {
        return isEntityVisibleFromPos(spawnPos, itemEntity);
    });
}




let justSentLogin = false;

bot.on('resourcePack', (url, hash) => {
    // console.log('Сервер предложил пакет ресурсов. Принимаю.');
    bot.acceptResourcePack();
});

bot.on('spawn', () => {
    bot.chat(`/msg ${WATCHED_PLAYERS[0]} плюх`);
    // console.log("Событие 'spawn' получено.");
    initializeBotState();

});

bot.once('login', () => {
    // bot.chat(`/msg ${WATCHED_PLAYERS[0]} плюх`);
    bot.chat(`/l ${PASSWORD}`);
    // console.log("Событие 'spawn' получено.");
    // initializeBotState();
    bot.chat('/server sleepcraft');

});

bot.on("plasmovoice_audio_end", () => {
    SOUND = null
})

bot.on('playerCollect', (player, item) => {
    id = item?.metadata?.[8]?.itemId
    count = item?.metadata?.[8]?.itemCount
    name = itemProtocolIdMap[id]

    const { x, y, z } = item.position
    const roundedX = Math.round(x)
    const roundedY = Math.round(y)
    const roundedZ = Math.round(z)

    // console.log(`ID: ${id}, тип: ${name}, количество ${count}`);

    let loreItem = 'нет';
    try {
        loreItem = item.metadata[8].nbtData.value.display.value.Lore.value.value[0]
            .split('Подпись: #')[1]
            .split('","bold"')[0];
    } catch (e) {
    }

    // if (WATCHED_PLAYERS.includes(loreItem)) {
    // if (loreItem) {
    //     bot.chat(`/msg ${WATCHED_PLAYERS[0]} ${player.username} <- ${name} x${count} в ${roundedX} ${roundedY} ${roundedZ}, подпись: ${loreItem}`)
    // } else {
    console.log(`${player.username} <- ${name} x${count} в ${roundedX} ${roundedY} ${roundedZ}`)
    // }
    // console.log(JSON.stringify(item?.metadata, null, 2));
    // console.log(require('util').inspect(item?.metadata, { depth: null, colors: true }));
})

bot.on('message', (jsonMsg, position) => {
    console.log(jsonMsg.toAnsi());
    let plainMessage = jsonMsg.toString();

    if (plainMessage === "Your login session has been continued." || plainMessage === "Your connection to sleepcraft encountered a problem." || plainMessage === "You have successfully logged.") {
        console.log('Пытаюсь зайти!')
        bot.chat('/server sleepcraft');
    }

    if (plainMessage.includes(' › ') || plainMessage.startsWith('💬 [ДС] ')) {
        if (plainMessage.includes('Вам] › ')) {
            // [vlkardakov -> Вам] › come
            message = plainMessage.split('Вам] › ')[1]
            username = plainMessage.split('[')[1].split(' ->')[0]

        } else if (plainMessage.startsWith('💬 [ДС] ')) {
            // 💬 [ДС] vlkardakov: сообщение из дискорда
            plainMessage = plainMessage.replace('💬 [ДС] ', '')
            // vlkardakov: сообщение из дискорда
            message = plainMessage.split(': ')[1]
            // сообщение из дискорда
            username = plainMessage.split(': ')[0]
            // vlkardakov

        } else if (plainMessage.includes(' › ')) {
            // vlkardakov › come
            message = plainMessage.split(' › ')[1]
            username = plainMessage.split(' › ')[0]

        }

        const parts = message.trim().toLowerCase().split(" ");
        const command = parts[0];
        const args = parts.slice(1);

        // console.log(`username: '${username}', command: '${command}'`);



        switch (command) {
            case "exec":
                if (!WATCHED_PLAYERS.includes(username)) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я не буду этого делать!!!`)
                    bot.chat(`/msg ${username} Я не буду этого делать!!!`)
                    return;
                }
                eval(message.split('exec ')[1]);
                // bot.chat("Ест!");
                return;

            case "say":
                // if (!WATCHED_PLAYERS.includes(username)) {
                //     bot.chat('Я не буду этого делать!!!')
                //     return;}
                bot.chat(message.includes('/') ? message.split('say ')[1] : `!${message.split('say ')[1]}`);
                return;

            case "activate":

                if (args.length < 1) {
                    // bot.chat("Укажи цель: activate <ник_игрока | тип_моба>");
                    return;
                }
                let targetname = args[0];

                bot.chat(`/msg ${WATCHED_PLAYERS[0]} Ищу цель: ${targetname}`);
                bot.chat(`/msg ${username} Ищу цель: ${targetname}`);

                const entityToActivate = findEntityWithName(bot, targetname);
                if (entityToActivate) {
                    const headPosition = entityToActivate.position.offset(0, entityToActivate.height * 0.9, 0);
                    bot.lookAt(headPosition);
                    bot.activateEntity(entityToActivate);
                }
                return;

            case "activateblock":
                const blockToActivate = bot.findBlock({
                    matching: block => {
                        const nameMatches = block.name.toLowerCase().includes(parts[1].toLowerCase())
                        const isVisible = bot.canSeeBlock(block)
                        return nameMatches && isVisible
                    },
                    maxDistance: 5,
                    useExtraInfo: true
                })
                if (blockToActivate) {
                    bot.lookAt(blockToActivate.position);
                    bot.activateBlock(blockToActivate);
                }
                return;

            case "comeblock":
                const blockToCome = bot.findBlock({
                    matching: block => {
                        const nameMatches = block.name.toLowerCase().includes(parts[1].toLowerCase())
                        // const isVisible = bot.canSeeBlock(block)
                        return nameMatches //&& isVisible
                    },
                    maxDistance: 50,
                    useExtraInfo: true
                })
                if (blockToCome) {
                    bot.pathfinder.setMovements(defaultMove);
                    bot.pathfinder.setGoal(new goals.GoalBlock(blockToCome.position.x, blockToCome.position.y, blockToCome.position.z, 2))
                    console.log('Иду к блоку')
                } else {
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Блок не найден 😢`)
                    bot.chat(`/m ${username} Блок не найден 😢`)
                }
                break;


            case 'restart':
                initializeBotState();

                if (isInitialSpawn) {
                    // console.log("Первый спавн: Запуск процесса входа...");

                } else {
                    bot.setControlState('sprint', true);
                }
                return;
            case "drop":
                if (!WATCHED_PLAYERS.includes(username)) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я не буду этого делать!!!`)
                    bot.chat(`/msg ${username} Я не буду этого делать!!!`)
                    return;

                }

                ;(async () => {

                async function safeToss(item, amount) {
                    const slot = item.slot
                    if (slot < 9 || slot > 44) {
                        try {
                            await bot.equip(item, 'hand')
                            await bot.unequip('hand')
                        } catch (err) {
                            bot.chat(`/msg ${WATCHED_PLAYERS[0]} не смог снять ${item.name}: ${err.message}`)
                            return
                        }
                    }

                    bot.toss(item.type, null, Math.min(item.count, amount), err => {
                        if (!err) {
                            // bot.chat(`/msg ${WATCHED_PLAYERS[0]} выбросил ${Math.min(item.count, amount)} ${item.name}`)
                        } else {
                            // bot.chat(`/msg ${WATCHED_PLAYERS[0]} не смог выкинуть ${item.name}: ${err.message}`)
                        }
                    })
                }

                for (let i = 1; i < parts.length; i += 2) {
                    const itemName = parts[i].toLowerCase()
                    const amount = parts[i + 1] === "all" ? Infinity : parseInt(parts[i + 1])

                    const allItems = [
                        ...bot.inventory.items(),
                        bot.inventory.slots[45],
                        bot.inventory.slots[5],
                        bot.inventory.slots[6],
                        bot.inventory.slots[7],
                        bot.inventory.slots[8],
                    ].filter(it => it)

                    const matchingItems = allItems.filter(it => it.name.toLowerCase().includes(itemName))

                    if (matchingItems.length > 0) {
                        for (const item of matchingItems) {
                            await safeToss(item, amount)
                        }
                    } else {
                        bot.chat(`/msg ${WATCHED_PLAYERS[0]} у меня нет ничего типа '${itemName}'`)
                        bot.chat(`/msg ${username} у меня нет ничего типа '${itemName}'`)
                    }
                }

            })()
                return;


            case "collect":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`);
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`);
                    return;
                }

//                bot.on('entityHurt', async (entity) => {
//
//                    if (entity === bot.entity) {
//                        // bot.chat('Получен урон :(')
//                        console.log('Меня атакуют!');
//
//                        bot.pathfinder.setGoal(null);
//
//                        const nearestEntity = bot.nearestEntity(entity =>
//                            entity !== bot.entity && isEntityVisible(entity) && !entity.name.includes('item') && !entity.name.includes('stand')
//                        );
//                        // bot.chat('Я знаю, кто ударил!')
//                        if (nearestEntity) {
//                            collecting_paused = true;
//                            console.log(`Атакую сущность: ${nearestEntity.name}`);
//                            bot.pathfinder.setMovements(defaultMove);
//                            bot.pathfinder.setGoal(null)
//                            bot.pathfinder.setGoal(new goals.GoalFollow(nearestEntity, 0));
//                            bot.pvp.attack(nearestEntity);  // Атакуем сущность
//
//
//
//                            const healthChecker = setInterval(() => {
//                                if (!isEntityVisible(nearestEntity)) {
//                                    console.log(`${nearestEntity.name} убита!`);
//                                    // bot.chat('Ха! я победил!')
//                                    collecting_paused = false;
//                                    collecting_paused = false;
//                                    bot.pvp.stop()
//                                    clearInterval(healthChecker);
//
//
//                                } else {
//                                    const campsword = bot.inventory.items().find(item => item.name.includes("sword"));
//                                    if (campsword && (!bot.heldItem || bot.heldItem.type !== campsword.type)) {
//                                        bot.equip(campsword, 'hand').catch(err => console.log(`Ошибка экипировки меча: ${err.message}`));
//                                    }
//
//                                }
//                            }, 500);
//
//                        const onEntityGone = (goneEntity) => {
//                            if (goneEntity === nearestEntity) {
//                                console.log(`${goneEntity.name} исчезла или убита!`);
//                                collecting_paused = false;
//                                bot.pvp.stop();
//                                clearInterval(healthChecker);
//                                bot.pathfinder.setMovements(defaultMove);
//                                bot.pathfinder.setGoal(null);
//                            }
//                        };
//
//                        bot.once('entityGone', onEntityGone);
//                        } else {
//                            collecting_paused = false;
//                            console.log('Нет подходящих сущностей для атаки');
//                        }
//                    }
//                });
            function findNearestItem(searchName = '') {
                wanted_ids = []
                if (searchName) {
                    wanted_ids = selectIdsWithName(searchName);
                }
                return bot.nearestEntity(entity => {
                    if (searchName) {
                        if (wanted_ids.includes(entity?.metadata?.[8]?.itemId) && entity?.metadata?.[8]?.present && entity.name === 'item' && (isItemOnSpawn(entity)  || isEntityVisible(entity)) && !getUsedIds().includes(entity.id)) {
                            return true;
                        }
                    } else {
                        return entity.name === 'item' && entity?.metadata?.[8]?.present && (isItemOnSpawn(entity) || isEntityVisible(entity)) && !getUsedIds().includes(entity.id);
                    }
                });
            }

            function isFarFromCenter() {
                const pos = bot.entity.position;
                const dx = pos.x;
                const dz = pos.z;
                return Math.sqrt(dx * dx + dz * dz) > 15;
            }

            async function depositItems() {
                if (justCheckedBarrel) {return}
                console.log('Запуск очистки...')
                justCheckedBarrel = true
                chestPos = vec3(6.5, 88, 6.5);
                await bot.pathfinder.goto(new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 0));

                const blocks = bot.findBlocks({
                    matching: block => block.name.includes('barrel'),
                    maxDistance: 4,
                    count: 999,
                })

                const chestBlock = blocks
                    .map(pos => bot.blockAt(pos))
                    .find(block => block && block.position.y === 85)

                console.log(`Distnace to barrel: ${bot.entity.position.distanceTo(chestPos)}`);
                if (!chestBlock) {
                    bot.chat(`/msg ${username} не нашел бочку :(`);
                    return;
                }

                const chest = await bot.openContainer(chestBlock);

                for (let item of bot.inventory.items()) {
                    if (!item.name.includes('beef') && !item.name.includes('pork') && !item.name.includes('chicken') && !item.name.includes('bread') && !item.name.includes('mutt') && !item.name.includes('sword')) {
                        try {
                            console.log(`Кладу ${item.name}`)
                            await chest.deposit(item.type, null, item.count);
                        } catch (err) {
                            console.log(`Не смог положить ${item.name}: ${err.message}`);
                        }
                    }
                }
                chest.close();
            }
                justCheckedBarrel = true;
                let collectInterval = null;

            function startCollecting(searchName = '') {
                if (collectInterval) clearInterval(collectInterval);

                task = 'collecting';

                collectInterval = setInterval(async () => {
                    if (collecting_paused) {
                        console.log('Сбор приостановлен, жду 5 секунд...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        return;
                    }
                    const targetItem = findNearestItem(searchName);
                    if (targetItem && collectingId !== targetItem.id) {
                        collectingId = targetItem.id;
                        setState(`collecting:${targetItem.id}`);
                        console.log(`debug states:`)
                        console.log(readStates())
                    } else if (collectingId !== null) {
                        setState(`collecting:null`);
                        collectingId = null
                    }

                    if (targetItem && !bot.pathfinder.goal) {
                        bot.pathfinder.setMovements(defaultMove);
                        id = targetItem?.metadata?.[8]?.itemId
                        count = targetItem?.metadata?.[8]?.itemCount
                        console.log(`ID: ${id}, тип: ${itemProtocolIdMap[id]}, количество ${count}`);
                        // console.log(JSON.stringify(targetItem.metadata, null, 2));
                        justCheckedBarrel = false;
                        bot.chat(`/msg ${WATCHED_PLAYERS[0]} Иду!`)
                        bot.pathfinder.setMovements(defaultMove);
                        bot.pathfinder.setGoal(null)
                        bot.pathfinder.setGoal(new GoalFollow(targetItem, 0));
                    } else {
                        if (isFarFromCenter() && !bot.pathfinder.goal) {
                            bot.chat(`/msg ${WATCHED_PLAYERS[0]} Возвращаюсь на базу..`)
                            chestPos = vec3(7, 87, 6);
                            await bot.pathfinder.goto(new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 0));
                        } else if (!justCheckedBarrel && !bot.pathfinder.goal) {
                            await depositItems();
                            bot.chat(`/msg ${WATCHED_PLAYERS[0]} Мусор собран!`)
                            blockToLookAfterDeposit = bot.findBlock({
                                matching: block => {
                                    const nameMatches = block.name.toLowerCase().includes('calcite')
                                    const isVisible = bot.canSeeBlock(block)
                                    return nameMatches && isVisible
                                },
                                maxDistance: 5,
                                useExtraInfo: true
                            })
                            if (blockToLookAfterDeposit) {
                                bot.lookAt(blockToLookAfterDeposit.position);
                            }
                            // bot.pathfinder.setGoal(new goals.GoalNear(7, 87, 6, 0 ));
                        }
                    }

                    if (!collecting) {
                        bot.chat(`/msg ${WATCHED_PLAYERS[0]} прекращаю!`);
                        if (collectInterval) clearInterval(collectInterval);
                        bot.pathfinder.setGoal(null);
                        return;
                    }

                }, 1000);
            }

                const searchName = parts[1]
                console.log(searchName)
                collecting = true;
                startCollecting(searchName);
                break;

            case "camp":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    return;
                }


                if (args.length < 1) {
                    bot.chat(`/msg ${username} Укажи цель: camp <ник_игрока | тип_моба>`);
                    return;
                }
                if (MODE === "мирный") {
                    bot.chat(`/msg ${username} Я сегодня добрый!`)
                    return;
                }
                let camptargetUsername = args[0];
                if (camptargetUsername === 'vlkardakov') {
                    // bot.chat(Нет идите нафиг')
                    return;
                }
                bot.chat(`/msg ${WATCHED_PLAYERS[0]} Ищу цель: ${camptargetUsername}`);
                bot.chat(`/msg ${username} Ищу цель: ${camptargetUsername}`);
                task = 'camp'

            function findNewTarget() {
                return findEntityWithName(bot, camptargetUsername);
            }

            function startCampAttack(targetEntity) {
                if (!targetEntity) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Не найдена сущность: ${camptargetUsername}.`);
                    task = null
                    return;
                }

                const camptargetName = targetEntity.username || targetEntity.mobType || targetEntity.name || 'неизвестная сущность';

                // bot.pathfinder.setGoal(null);
                // bot.pvp.stop();
                // bot.pathfinder.setMovements(defaultMove);
                // bot.pathfinder.setGoal(new GoalFollow(targetEntity, RANGE_GOAL), true);

                let campattackInterval = null;
                const campMAX_ATTEMPTS = 250;
                let campattackAttempts = 0;

                function campattackLoop() {
                    if (!targetEntity || !targetEntity.isValid || campattackAttempts >= campMAX_ATTEMPTS) {
                        bot.chat(`/msg ${WATCHED_PLAYERS[0]} Хахаха ничтожество /s`);
                        bot.pathfinder.setGoal(null);
                        bot.pvp.stop();
                        if (campattackInterval) clearInterval(campattackInterval);


                        const newTarget = findNewTarget();
                        if (newTarget && newTarget !== targetEntity) {
                            startCampAttack(newTarget);
                        }
                        task = null;
                        return;
                    }
                    bot.on('message', (jsonMsg, position) => {
                        if (jsonMsg.toString().includes('stop')) {
                            bot.pathfinder.setGoal(null);
                            bot.pvp.stop();
                            if (campattackInterval) clearInterval(campattackInterval);
                            task = null;
                            return;
                        }
                    })

                    const campsword = bot.inventory.items().find(item => item.name.includes("sword"));
                    if (campsword && (!bot.heldItem || bot.heldItem.type !== campsword.type)) {
                        bot.equip(campsword, 'hand').catch(err => console.log(`Ошибка экипировки меча: ${err.message}`));
                    }

                    if (command === 'kill' && !isEntityVisible(targetEntity)) {
                    } else {
                        bot.pvp.attack(targetEntity);
                    }

                    campattackAttempts++;
                }

                campattackInterval = setInterval(campattackLoop, 500);
            }

                const initialTarget = findNewTarget();
                startCampAttack(initialTarget);
                break;



            case "kill":
                if (task) {
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    return;
                }

                if (MODE === "мирный") {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я сегодня добрый!`)
                    bot.chat(`/msg ${username} Я сегодня добрый!`)
                    return;
                }
                if (args.length < 1) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Укажи цель: attack/kill <ник_игрока | тип_моба>`);
                    bot.chat(`/msg ${username} Укажи цель: attack/kill <ник_игрока | тип_моба>`);
                    return;
                }
                let targetUsername = args[0];
                if (targetUsername === 'enemy') targetUsername = 'zombie';

                if (targetUsername === 'vlkardakov') {
                    bot.chat(`/msg ${username} Нет идите нафиг`)
                    return;}

                targetEntity = findEntityWithName(bot, targetUsername);

                if (!targetEntity) {
                    bot.chat(`/msg ${username} Не ${command === 'kill' ? 'вижу' : 'найдена'} сущность: ${targetUsername}.`);
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Не ${command === 'kill' ? 'вижу' : 'найдена'} сущность: ${targetUsername}.`);
                    return;
                }
                bot.pathfinder.setGoal(null);
                bot.pvp.attack(targetEntity);
                break;
            case "remember":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    return;
                }

                task = 'remembering'

                const rememberContainers = async () => {
                    const radius = parseInt(parts[1]) || 15

                    let blocks = bot.findBlocks({
                        matching: block => {
                            return (
                                block &&
                                block.name.toLowerCase().includes("barrel")
                            )
                        },
                        maxDistance: radius,
                        count: 999
                    })

                    const getDistance = (block1, block2) => {
                        if (!block1.position || !block2.position) return Infinity;

                        return Math.sqrt(
                            Math.pow(block1.position.x - block2.position.x, 2) +
                            Math.pow(block1.position.y - block2.position.y, 2) +
                            Math.pow(block1.position.z - block2.position.z, 2)
                        )
                    }

                    let currentBlock = blocks[0]
                    let remainingBlocks = blocks.slice(1)

                    remainingBlocks.sort((a, b) => getDistance(bot.entity, a) - getDistance(bot.entity, b))

                    blocks = [currentBlock]
                    while (remainingBlocks.length > 0 && (task === 'remembering')) {
                        let nearestBlock = remainingBlocks[0]
                        remainingBlocks.forEach(block => {
                            if (getDistance(currentBlock, block) < getDistance(currentBlock, nearestBlock)) {
                                nearestBlock = block
                            }
                        })

                        blocks.push(nearestBlock)

                        currentBlock = nearestBlock

                        remainingBlocks = remainingBlocks.filter(block => block !== nearestBlock)
                    }

                    const memoryData = []

                    for (let pos of blocks) {
                        const block = bot.blockAt(pos)
                        if (task !== 'remembering') {break}
                        if (!block || !block.position) continue

                        try {
                            await bot.pathfinder.goto(new GoalNear(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), 4))

                            const container = await bot.openContainer(block)
                            const items = container.slots.filter(slot => slot && slot.name) // Получаем предметы из контейнера
                            const itemsData = items.map(item => ({
                                name: item.name,
                                count: item.count
                            }))

                            memoryData.push({
                                name: block.name,
                                x: block.position.x,
                                y: block.position.y,
                                z: block.position.z,
                                items: itemsData
                            })

                            container.close()
                        } catch (err) {
                            console.log(`Не удалось открыть контейнер в позиции ${block.position}: ${err.message}`)
                        }
                    }

                    containerMemory = memoryData
                    console.table(memoryData)
                    memoryData.forEach(container => {
                        console.log(`Контейнер: ${container.name} (x: ${container.x}, y: ${container.y}, z: ${container.z})`)

                        if (container.items && container.items.length > 0) {
                            console.log(`  Содержимое:`)
                            container.items.forEach(item => {
                                console.log(`    - ${item.name} x${item.count}`)
                            })
                        } else {
                            console.log(`  Нет предметов в этом контейнере`)
                        }
                    })

                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Запомнил ${memoryData.length} контейнеров с предметами!`)
                    bot.chat(`/msg ${username} Запомнил ${memoryData.length} контейнеров с предметами!`)
                    task = null
                }

                rememberContainers()
                break

            case "steal":
                const itemName = parts[1]
                if (!itemName) {
                    bot.chat("че воровать-то? введи чёт типа: steal diamond")
                    return
                }

                stealItems(itemName, username)
                break
            case "addspawnpos":
                const pos = bot.players[username].entity.position.floored();
                SPAWN_POSITIONS.push(pos);
                bot.chat(`/msg ${username} Добавил позицию: ${pos.x}, ${pos.y}, ${pos.z}`);
                break;

            case "logspawnpos":
                console.log('Спавна позици щапрошены')
                if (SPAWN_POSITIONS.length === 0) {
                    bot.chat(`/msg ${username} Спаунов нет 😢`);
                } else {
                    console.log("const SPAWN_POSITIONS = [");
                    SPAWN_POSITIONS.forEach((pos) => {
                        console.log(`    new vec3(${pos.x}, ${pos.y}, ${pos.z}),`);
                    });
                    console.log("];");

                    bot.chat(`/msg ${username} Смотри консоль`);
                }
                break;


            case "play":
                console.log('Произведение музыки запрошено');
                if (SOUND || playing) {
                    bot.chat(`/msg ${username} Я уже играю ${SOUND}`);
                    return;
                }

                SOUND = args[0] || "vivalavida";


                const ffmpeg = require('fluent-ffmpeg');
                const fs = require('fs');
                const path = require('path');


                let audioFile;
                try {
                    audioFile = path.join('/rusvan-bots/music', `${SOUND}.mp3`);
                    if (!fs.existsSync(audioFile)) {
                        console.error('Файл не найден:', audioFile);
                        bot.chat(`/msg ${username} ты просишь несуществующую музыку!!`)
                        SOUND = null;
                        playing = false;
                        return;
                    }
                } catch (err) {
                    console.error('Ошибка при проверке файла:', err);
                    SOUND = null;
                    playing = false;
                    return;
                }

                const tempDir = path.join('/rusvan-bots/music', `temp_audio${NUMBER}`);
                playing = true;
                ffmpeg.ffprobe(audioFile, (err, metadata) => {
                    if (err) {
                        console.error('Ошибка при анализе аудиофайла:', err);
                        return;
                    }

                    const duration = metadata.format.duration;
                    const segmentCount = Math.ceil(duration) / 4;

                    console.log(`Разделение аудио на ${segmentCount} сегментов по 1 секунде`);

                    ffmpeg(audioFile)
                        .outputOptions([
                            '-f segment',
                            '-segment_time 4',
                            '-c copy',
                            '-map 0:a'
                        ])
                        .output(`${tempDir}/segment-%03d.mp3`)
                        .on('end', () => {
                            console.log('Аудио успешно разделено');

                            sendSegmentsSequentially(0, segmentCount, tempDir);
                        })
                        .on('error', (err) => {
                            console.error('Ошибка при разделении аудио:', err);
                        })
                        .run();
                });

            function sendSegmentsSequentially(index, total, tempDir) {
                if (index >= total || !playing) {
                    console.log('Все сегменты отправлены');
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я закончил играть!`)
                    SOUND = null;
                    playing = false;
                    fs.readdirSync(tempDir).forEach(file => {
                        fs.unlinkSync(path.join(tempDir, file));
                    });
                    playing = false;
                    return;
                }

                const segmentFile = path.join(tempDir, `segment-${index.toString().padStart(3, '0')}.mp3`);

                bot.plasmovoice.sendAudio(segmentFile)
                    .then(() => {
                        // console.log(`Отправлен сегмент ${index + 1}/${total}`);
                        setTimeout(() => {
                            sendSegmentsSequentially(index + 1, total, tempDir);
                        }, 4000);
                    })
                    .catch(err => {
                        console.error(`Ошибка при отправке сегмента ${index + 1}:`, err);
                        sendSegmentsSequentially(index + 1, total, tempDir);
                    });
            }
                break;

            case "hi":
                if (args.length < 200) {
                    bot.chat(`/msg ${username} Привета!`);
                    return;
                }

            case "сосал?":
                if (args.length < 200) {
                    bot.chat(`!Да.`);
                    return;
                }

                if (task) {
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    return;
                }

            case "server":
                if (args.length < 200) {
                    bot.chat("/server sleepcraft");
                    return;
                }

            case "break":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    return;
                }
                if (args.length < 2) {
                    console.log('Укажи блок и количество: break <тип_блока> <количество>')
                    return;
                }
                const blockType = args[0];
                const amount = parseInt(args[1]);

                if (isNaN(amount) || amount <= 0) {
                    return;
                }

                collectBlockType(blockType, amount);
                break;

            case "nearest":
                if (args.length < 1) {
                    bot.chat(`/msg ${username} Укажи тип сущности: nearest <тип>`);
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Укажи тип сущности: nearest <тип>`);
                    return;
                }
                let entityType = args[0];
                let nearestEntity = findEntityWithName(bot, entityType);

                if (nearestEntity) {
                    const neName = nearestEntity.username || nearestEntity.mobType || nearestEntity.name || 'Неизвестная сущность';
                    const nePos = nearestEntity.position.floored();
                    const dist = bot.entity.position.distanceTo(nearestEntity.position).toFixed(1);
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Ближайший ${entityType}: ${neName} в [${nePos.x}, ${nePos.y}, ${nePos.z}] (${dist}м)`);
                    bot.chat(`/msg ${username} Ближайший ${entityType}: ${neName} в [${nePos.x}, ${nePos.y}, ${nePos.z}] (${dist}м)`);
                } else {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Не найдено сущностей типа ${entityType} поблизости.`);
                    bot.chat(`/msg ${username} Не найдено сущностей типа ${entityType} поблизости.`);
                }
                break;

            case "come":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`)
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`)
                    return;
                }

                let playerToCome;

                if (args.length < 1) {
                    playerToCome = bot.players[username]?.entity;
                    console.log('Аргументов нет')
                } else {
                    let targetname = args[0];
                    console.log('Аргументы ест')
                    playerToCome = findEntityWithName(bot, targetname);
                }



                if (playerToCome) {
                    async function comePlayer() {
                        bot.pathfinder.setMovements(defaultMove);
                        console.log(`[DEBUG] Перед setGoal(GoalFollow): canDig=${bot.pathfinder.movements.canDig}, canPlaceBlocks=${bot.pathfinder.movements.canPlaceBlocks}, allow1by1towers=${bot.pathfinder.movements.allow1by1towers}`);
                        await bot.pathfinder.setGoal(new GoalFollow(playerToCome, 0));
                        task = null;
                        console.log("Готово!");
                    }

                    comePlayer();
                } else {
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Я не вижу цель :(`)
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Я тебя не вижу :(`)
                }
                break;

            case "teleport":
                if (task) {
                    bot.chat(`/msg ${username} Бро, я занят другим заданием: ${task}`);
                    return;
                }

                let playerToTeleport;

                if (args.length < 1) {
                    playerToTeleport = bot.players[username]?.entity;
                    console.log('[TP DEBUG] Цель — вызывающий');
                } else {
                    const targetTeleportName = args[0];
                    playerToTeleport = findEntityWithName(bot, targetTeleportName);
                    console.log('[TP DEBUG] Цель — по аргументу');
                }

                if (!playerToTeleport) {
                    bot.chat(`/msg ${username} Я не вижу цель для тп 😢`);
                    return;
                }

                const teleportTargetPosition = playerToTeleport.position;

                const enderPearlItem = bot.inventory.items().find(item => item.name === 'ender_pearl');
                if (!enderPearlItem) {
                    bot.chat(`/msg ${username} У меня закончились жемчужки 😭`);
                    return;
                }

            async function teleportToPlayer(targetPosition) {
                try {
                    await bot.equip(enderPearlItem, 'hand');
                    await bot.lookAt(targetPosition);

                    bot.chat(`/msg ${username} Прицелился... Кидаю! 🎯`);

                    bot.activateItem();
                    await bot.waitForTicks(5);
                    bot.deactivateItem();

                } catch (teleportError) {
                    console.log('[TP ERROR] Не смог ', teleportError);
                    bot.chat(`/msg ${username} Что-то пошло не так с телепортом..`);
                }
            }

                teleportToPlayer(teleportTargetPosition);
                break;


            case "cometo":
                if (task) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я уже занят заданием ${task}`);
                    bot.chat(`/msg ${username} Я уже занят заданием ${task}`);
                    return;
                }

                let distanceToMove = 0;

                if (args.length < 1 || isNaN(args[0])) {
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Нужно указать расстояние в блоках.`);
                    bot.chat(`/m ${username} Нужно указать расстояние в блоках.`);
                    return;
                } else {
                    distanceToMove = parseInt(args[0], 10);
                }

                const playerLooking = bot.players[username]?.entity;

                if (playerLooking) {
                    async function moveToDirection() {
                        bot.pathfinder.setMovements(defaultMove);
                        console.log(`[DEBUG] Перед setGoal(GoalFollow): canDig=${bot.pathfinder.movements.canDig}, canPlaceBlocks=${bot.pathfinder.movements.canPlaceBlocks}, allow1by1towers=${bot.pathfinder.movements.allow1by1towers}`);

                        const direction = playerLooking?.entity.position.clone().add(playerLooking.entity.rotation);
                        const targetPosition = direction.multiplyScalar(distanceToMove);

                        await bot.pathfinder.setGoal(new goals.GoalBlock(targetPosition.x, targetPosition.y, targetPosition.z));
                        task = null;
                        console.log("Готово!");
                    }

                    moveToDirection();
                } else {
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Я не вижу игрока, куда мне двигаться :(`);
                    bot.chat(`/m ${WATCHED_PLAYERS[0]} Я тебя не вижу, не могу двигаться :(`);
                }
                break;

            case "mode":
                if (!WATCHED_PLAYERS.includes(username)) {
                    bot.chat(`/msg ${username} Я тебя не слушаюсь 🥲`)
                    return;}
                if (MODE === 'мирный') {
                    MODE = 'злой'
                } else {
                    MODE = 'мирный'
                }
                bot.chat(`/msg ${WATCHED_PLAYERS[0]} Задан режим '${MODE}'`)
                bot.chat(`/msg ${username} Задан режим '${MODE}'`)
                return

            case "stop":
                if (!WATCHED_PLAYERS.includes(username)) {
                    bot.chat(`/msg ${WATCHED_PLAYERS[0]} Я не буду этого делать, я занят ${task}!!!`)
                    bot.chat(`/msg ${username} Я не буду этого делать, я занят ${task}!!!`)
                    return;
                }
                bot.chat(`/msg ${WATCHED_PLAYERS[0]} Останавливаюсь.`);
                bot.chat(`/msg ${username} Останавливаюсь.`);
                bot.pvp.stop();
                followingProtectedPlayer = false;
                miningSand = false;
                following = false;
                bot.pathfinder.setGoal(null);
                bot.pathfinder.stop();
                bot.clearControlStates();
                collecting = false;
                if (bot.collectBlock && bot.collectBlock.isCollecting) {
                    console.log("Прекращаю текущую задачу разрушения (если была активна).")
                }
                task = null;
                break;

            case "stop-music":
                SOUND = null;
                playing = false;
                break;

            case "status":
                bot.chat(`/msg ${username} task: ${task}, sound: ${SOUND}, playing: ${playing}, statusses: ${readStates()}`)
                console.log(readStates())

                break;

            default:
                break;
        }
    }
});

bot.on('kicked', (reason, loggedIn) => {
    console.error('Бот был кикнут!');
    console.error('--- Детали Причины Кика ---');
    try {
        console.error(JSON.stringify(reason, null, 2));
    } catch (e) {
        console.error(reason);
    }
    console.error('-------------------------');
    isInitialSpawn = true;
});

bot.on('error', (err) => {
    console.error('Ошибка бота:', err);
});

bot.on('end', (reason) => {
    console.log(`Бот отключился. Причина: ${reason}`);
    isInitialSpawn = true;
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Неперехваченное исключение:', err);
});