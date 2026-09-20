const TELEGRAM_API = "https://api.telegram.org/bot";

const START_POINTS = 1000;

const FARM_BASE = 1;
const FACTORY_BASE = 2;

const FARM_UPGRADE_BASE = 500;
const FACTORY_UPGRADE_BASE = 1000;

const PET_REWARD = 400;
const PET_COOLDOWN = 6 * 60 * 60 * 1000;

const STEAL_COOLDOWN = 10 * 60 * 1000;
const STEAL_PERCENT = 0.10;

const BANK_MIN = 100;
const BANK_MAX = 1000000;

const BANK_RATES = {
  1: 0.05,
  2: 0.12,
  3: 0.20
};

export default {
  async fetch(request, env) {
    try {
      if (request.method === "GET") {
        return new Response("Chia Games is alive! 🌱");
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const update = await request.json();

      // Dice must be checked BEFORE normal message handling.
      if (update.message?.dice) {
        await handleDice(update.message, env);
        return new Response("OK");
      }

      if (update.message) {
        await handleMessage(update.message, env);
        return new Response("OK");
      }

      return new Response("OK");
    } catch (error) {
      console.error("WORKER ERROR:", error);
      return new Response("OK");
    }
  }
};


// ======================================================
// TELEGRAM
// ======================================================

async function telegram(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const response = await fetch(
    `${TELEGRAM_API}${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!result.ok) {
    console.error("TELEGRAM ERROR:", result);
  }

  return result;
}


async function sendMessage(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}


// ======================================================
// STORAGE
// ======================================================

async function getPlayer(env, userId) {
  const key = `player:${userId}`;

  const existing = await env.CHIA_DB.get(key, "json");

  if (existing) {
    return existing;
  }

  const player = {
    id: userId,
    points: START_POINTS,

    farmLevel: 1,
    factoryLevel: 1,

    bankLevel: 0,
    bankAmount: 0,
    bankStartedAt: 0,

    petLastClaim: 0,
    lastSteal: 0,

    totalEarned: 0,
    totalStolen: 0,
    totalLost: 0,

    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await savePlayer(env, player);

  return player;
}


async function savePlayer(env, player) {
  player.updatedAt = Date.now();

  await env.CHIA_DB.put(
    `player:${player.id}`,
    JSON.stringify(player)
  );
}


// ======================================================
// PASSIVE INCOME
// ======================================================

function incomePerSecond(player) {
  return (
    FARM_BASE * player.farmLevel +
    FACTORY_BASE * player.factoryLevel
  );
}


function collectPassiveIncome(player) {
  const now = Date.now();

  const elapsed = Math.max(
    0,
    Math.floor((now - player.updatedAt) / 1000)
  );

  if (elapsed <= 0) {
    return 0;
  }

  const income =
    elapsed * incomePerSecond(player);

  player.points += income;
  player.totalEarned += income;
  player.updatedAt = now;

  return income;
}


// ======================================================
// MESSAGE HANDLER
// ======================================================

async function handleMessage(message, env) {
  if (!message.from || !message.chat) {
    return;
  }

  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  /*
   * /start is handled BEFORE KV.
   * This guarantees the welcome message does not depend
   * on the database for the first response.
   */
  if (
    text === "/start" ||
    text.startsWith("/start@")
  ) {
    await sendMessage(
      env,
      chatId,
      `🌱 <b>به Chia Games خوش آمدی!</b>

اینجا مزرعه، کارخانه، بانک، پت، سرقت و رقابت داری.

💰 موجودی اولیه: <b>${format(START_POINTS)}</b> پوینت

برای شروع:
🎮 /game`
    );

    return;
  }

  const player = await getPlayer(env, userId);

  collectPassiveIncome(player);
  await savePlayer(env, player);

  if (!text) {
    return;
  }

  const command = text
    .split(/\s+/)[0]
    .toLowerCase()
    .split("@")[0];


  // GAME

  if (command === "/game") {
    await sendGame(env, chatId, player);
    return;
  }


  // PROFILE

  if (
    command === "/profile" ||
    command === "/me" ||
    command === "/پروفایل"
  ) {
    await sendProfile(env, chatId, player);
    return;
  }


  // BALANCE

  if (
    command === "/balance" ||
    command === "/bal" ||
    command === "/موجودی"
  ) {
    await sendMessage(
      env,
      chatId,
      `💰 <b>موجودی تو</b>

<b>${format(player.points)}</b> پوینت

⚡ درآمد:
<b>${format(incomePerSecond(player))}</b> پوینت/ثانیه`
    );

    return;
  }


  // FARM

  if (
    command === "/farm" ||
    command === "/مزرعه"
  ) {
    await sendFarm(env, chatId, player);
    return;
  }


  // FACTORY

  if (
    command === "/factory" ||
    command === "/کارخانه"
  ) {
    await sendFactory(env, chatId, player);
    return;
  }


  // UPGRADE FARM

  if (
    command === "/upgradefarm" ||
    command === "/ارتقامزرعه"
  ) {
    await upgradeFarm(env, chatId, player);
    return;
  }


  // UPGRADE FACTORY

  if (
    command === "/upgradefactory" ||
    command === "/ارتقایکارخانه"
  ) {
    await upgradeFactory(env, chatId, player);
    return;
  }


  // PET

  if (
    command === "/pet" ||
    command === "/dog" ||
    command === "/سگ"
  ) {
    await claimPet(env, chatId, player);
    return;
  }


  // BANK

  if (
    command === "/bank" ||
    command === "/بانک"
  ) {
    await sendBank(env, chatId, player);
    return;
  }


  // INVEST

  if (
    command === "/invest" ||
    command === "/سرمایهگذاری"
  ) {
    const amount = Number(text.split(/\s+/)[1]);

    await invest(env, chatId, player, amount);
    return;
  }


  // WITHDRAW

  if (
    command === "/withdraw" ||
    command === "/برداشت"
  ) {
    await withdrawBank(env, chatId, player);
    return;
  }


  // STEAL

  if (
    command === "/steal" ||
    command === "/سرقت"
  ) {
    const target = message.reply_to_message?.from;

    if (!target) {
      await sendMessage(
        env,
        chatId,
        `🥷 برای سرقت، روی پیام بازیکن موردنظر <b>Reply</b> بزن و سپس:

<code>/steal</code>`
      );

      return;
    }

    await steal(env, chatId, player, target);
    return;
  }


  // TRANSFER

  if (
    command === "/transfer" ||
    command === "/انتقال"
  ) {
    const parts = text.split(/\s+/);
    const amount = Number(parts[1]);

    const target = message.reply_to_message?.from;

    if (!target) {
      await sendMessage(
        env,
        chatId,
        `💸 روی پیام بازیکن مقصد Reply بزن:

<code>/transfer 100</code>`
      );

      return;
    }

    await transfer(env, chatId, player, target, amount);
    return;
  }


  // GAMBLE

  if (
    command === "/gamble" ||
    command === "/قمار"
  ) {
    const amount = Number(text.split(/\s+/)[1]);

    await gamble(env, chatId, player, amount);
    return;
  }


  // LEADERBOARD

  if (
    command === "/top" ||
    command === "/leaderboard" ||
    command === "/برترینها"
  ) {
    await leaderboard(env, chatId);
    return;
  }


  // HELP

  if (
    command === "/help" ||
    command === "/راهنما"
  ) {
    await sendHelp(env, chatId);
    return;
  }
}


// ======================================================
// GAME
// ======================================================

async function sendGame(env, chatId, player) {
  await sendMessage(
    env,
    chatId,
    `🎮 <b>Chia Games</b>

💰 موجودی:
<b>${format(player.points)}</b>

🌾 مزرعه:
سطح ${player.farmLevel}

🏭 کارخانه:
سطح ${player.factoryLevel}

🏦 بانک:
سطح ${player.bankLevel}

🐶 پت:
+${PET_REWARD} هر ۶ ساعت

⚡ درآمد:
<b>${format(incomePerSecond(player))}</b> پوینت/ثانیه

<b>دستورها:</b>

/profile
/farm
/factory
/upgradefarm
/upgradefactory
/pet
/bank
/invest 1000
/withdraw
/gamble 100
/steal
/transfer 100
/top
/help`
  );
}


// ======================================================
// PROFILE
// ======================================================

async function sendProfile(env, chatId, player) {
  await sendMessage(
    env,
    chatId,
    `👤 <b>پروفایل Chia</b>

💰 پوینت:
<b>${format(player.points)}</b>

🌾 مزرعه:
سطح ${player.farmLevel}

🏭 کارخانه:
سطح ${player.factoryLevel}

🏦 بانک:
سطح ${player.bankLevel}
سرمایه: ${format(player.bankAmount)}

🐶 پت:
+${PET_REWARD} هر ۶ ساعت

⚡ درآمد:
${format(incomePerSecond(player))}/ثانیه

📈 کل درآمد:
${format(player.totalEarned)}

🥷 کل سرقت:
${format(player.totalStolen)}`
  );
}


// ======================================================
// FARM
// ======================================================

async function sendFarm(env, chatId, player) {
  const income =
    FARM_BASE * player.farmLevel;

  const cost =
    FARM_UPGRADE_BASE * player.farmLevel;

  await sendMessage(
    env,
    chatId,
    `🌾 <b>مزرعه</b>

سطح فعلی:
<b>${player.farmLevel}</b>

درآمد:
<b>${format(income)}</b> پوینت/ثانیه

💵 هزینه ارتقا:
<b>${format(cost)}</b>

<code>/upgradefarm</code>`
  );
}


async function upgradeFarm(env, chatId, player) {
  const cost =
    FARM_UPGRADE_BASE * player.farmLevel;

  if (player.points < cost) {
    await sendMessage(
      env,
      chatId,
      `❌ پوینت کافی نداری.

نیاز:
${format(cost)}

موجودی:
${format(player.points)}`
    );

    return;
  }

  player.points -= cost;
  player.farmLevel++;

  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🌾 <b>مزرعه ارتقا یافت!</b>

سطح جدید:
<b>${player.farmLevel}</b>

درآمد:
<b>${format(FARM_BASE * player.farmLevel)}</b>/ثانیه`
  );
}


// ======================================================
// FACTORY
// ======================================================

async function sendFactory(env, chatId, player) {
  const income =
    FACTORY_BASE * player.factoryLevel;

  const cost =
    FACTORY_UPGRADE_BASE * player.factoryLevel;

  await sendMessage(
    env,
    chatId,
    `🏭 <b>کارخانه</b>

سطح فعلی:
<b>${player.factoryLevel}</b>

درآمد:
<b>${format(income)}</b> پوینت/ثانیه

💵 هزینه ارتقا:
<b>${format(cost)}</b>

<code>/upgradefactory</code>`
  );
}


async function upgradeFactory(env, chatId, player) {
  const cost =
    FACTORY_UPGRADE_BASE * player.factoryLevel;

  if (player.points < cost) {
    await sendMessage(
      env,
      chatId,
      `❌ پوینت کافی نداری.

نیاز:
${format(cost)}

موجودی:
${format(player.points)}`
    );

    return;
  }

  player.points -= cost;
  player.factoryLevel++;

  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🏭 <b>کارخانه ارتقا یافت!</b>

سطح جدید:
<b>${player.factoryLevel}</b>

درآمد:
<b>${format(FACTORY_BASE * player.factoryLevel)}</b>/ثانیه`
  );
}


// ======================================================
// PET
// ======================================================

async function claimPet(env, chatId, player) {
  const now = Date.now();

  if (
    player.petLastClaim &&
    now - player.petLastClaim < PET_COOLDOWN
  ) {
    const remaining =
      PET_COOLDOWN -
      (now - player.petLastClaim);

    await sendMessage(
      env,
      chatId,
      `🐶 پت هنوز آماده نیست.

⏳ زمان باقی‌مانده:
<b>${formatTime(remaining)}</b>`
    );

    return;
  }

  player.points += PET_REWARD;
  player.totalEarned += PET_REWARD;
  player.petLastClaim = now;

  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🐶 <b>پاداش پت دریافت شد!</b>

+${PET_REWARD} پوینت 💰

موجودی:
<b>${format(player.points)}</b>`
  );
}


// ======================================================
// BANK
// ======================================================

async function sendBank(env, chatId, player) {
  const rate =
    BANK_RATES[player.bankLevel] || 0;

  await sendMessage(
    env,
    chatId,
    `🏦 <b>بانک Chia</b>

سطح بانک:
<b>${player.bankLevel}</b>

سرمایه فعلی:
<b>${format(player.bankAmount)}</b>

سود:
<b>${rate * 100}%</b>

<code>/invest 1000</code>

<code>/withdraw</code>

حداقل سرمایه:
${format(BANK_MIN)}`
  );
}


async function invest(env, chatId, player, amount) {
  if (
    !Number.isFinite(amount) ||
    amount < BANK_MIN
  ) {
    await sendMessage(
      env,
      chatId,
      `❌ حداقل سرمایه:
<b>${format(BANK_MIN)}</b>`
    );

    return;
  }

  if (amount > BANK_MAX) {
    await sendMessage(
      env,
      chatId,
      `❌ حداکثر سرمایه:
<b>${format(BANK_MAX)}</b>`
    );

    return;
  }

  if (player.points < amount) {
    await sendMessage(
      env,
      chatId,
      `❌ پوینت کافی نداری.`
    );

    return;
  }

  player.points -= amount;
  player.bankAmount += amount;
  player.bankStartedAt = Date.now();

  if (player.bankLevel === 0) {
    player.bankLevel = 1;
  }

  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🏦 <b>سرمایه‌گذاری انجام شد.</b>

سرمایه بانک:
<b>${format(player.bankAmount)}</b>

سطح:
<b>${player.bankLevel}</b>`
  );
}


async function withdrawBank(env, chatId, player) {
  if (player.bankAmount <= 0) {
    await sendMessage(
      env,
      chatId,
      `🏦 سرمایه‌ای در بانک نداری.`
    );

    return;
  }

  const principal = player.bankAmount;

  const rate =
    BANK_RATES[player.bankLevel] || 0;

  const elapsedDays =
    Math.max(
      0,
      (Date.now() - player.bankStartedAt) /
      (24 * 60 * 60 * 1000)
    );

  const profit =
    Math.floor(principal * rate * elapsedDays);

  const total =
    principal + profit;

  player.points += total;
  player.totalEarned += profit;

  player.bankAmount = 0;
  player.bankStartedAt = 0;

  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🏦 <b>برداشت انجام شد.</b>

اصل سرمایه:
${format(principal)}

سود:
${format(profit)}

💰 مبلغ دریافتی:
<b>${format(total)}</b>`
  );
}


// ======================================================
// TRANSFER
// ======================================================

async function transfer(
  env,
  chatId,
  player,
  target,
  amount
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    await sendMessage(
      env,
      chatId,
      `❌ مبلغ انتقال نامعتبر است.`
    );

    return;
  }

  if (target.id === player.id) {
    await sendMessage(
      env,
      chatId,
      `❌ نمی‌توانی به خودت پوینت انتقال بدهی.`
    );

    return;
  }

  if (player.points < amount) {
    await sendMessage(
      env,
      chatId,
      `❌ پوینت کافی نداری.`
    );

    return;
  }

  const receiver =
    await getPlayer(env, target.id);

  player.points -= amount;
  receiver.points += amount;

  await savePlayer(env, player);
  await savePlayer(env, receiver);

  await sendMessage(
    env,
    chatId,
    `💸 <b>انتقال انجام شد.</b>

مبلغ:
<b>${format(amount)}</b>

به:
<b>${escapeHtml(target.first_name || "بازیکن")}</b>

موجودی تو:
<b>${format(player.points)}</b>`
  );
}


// ======================================================
// STEAL
// ======================================================

async function steal(
  env,
  chatId,
  player,
  target
) {
  const now = Date.now();

  if (target.id === player.id) {
    await sendMessage(
      env,
      chatId,
      `🥷 نمی‌توانی خودت را بدزدی!`
    );

    return;
  }

  if (
    player.lastSteal &&
    now - player.lastSteal < STEAL_COOLDOWN
  ) {
    const remaining =
      STEAL_COOLDOWN -
      (now - player.lastSteal);

    await sendMessage(
      env,
      chatId,
      `⏳ هنوز آماده نیستی.

زمان باقی‌مانده:
<b>${formatTime(remaining)}</b>`
    );

    return;
  }

  const victim =
    await getPlayer(env, target.id);

  collectPassiveIncome(victim);

  if (victim.points <= 0) {
    await sendMessage(
      env,
      chatId,
      `🥷 چیزی برای سرقت وجود ندارد!`
    );

    return;
  }

  const stolen =
    Math.max(
      1,
      Math.floor(victim.points * STEAL_PERCENT)
    );

  victim.points -= stolen;
  player.points += stolen;

  player.totalStolen += stolen;
  victim.totalLost += stolen;
  player.lastSteal = now;

  await savePlayer(env, victim);
  await savePlayer(env, player);

  await sendMessage(
    env,
    chatId,
    `🥷 <b>سرقت موفق بود!</b>

💰 مبلغ سرقت:
<b>${format(stolen)}</b>

🎯 هدف:
${escapeHtml(target.first_name || "بازیکن")}

موجودی تو:
<b>${format(player.points)}</b>

⏱ سرقت بعدی:
۱۰ دقیقه دیگر`
  );
}


// ======================================================
// GAMBLE
// ======================================================

async function gamble(
  env,
  chatId,
  player,
  amount
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    await sendMessage(
      env,
      chatId,
      `🎯 مبلغ قمار را مشخص کن:

<code>/gamble 100</code>`
    );

    return;
  }

  if (player.points < amount) {
    await sendMessage(
      env,
      chatId,
      `❌ پوینت کافی نداری.`
    );

    return;
  }

  player.points -= amount;

  await savePlayer(env, player);

  const result = await telegram(
    env,
    "sendDice",
    {
      chat_id: chatId,
      emoji: "🎯"
    }
  );

  if (!result.ok || !result.result) {
    player.points += amount;
    await savePlayer(env, player);

    await sendMessage(
      env,
      chatId,
      `❌ خطا در اجرای قمار. پوینتت برگشت داده شد.`
    );

    return;
  }

  const diceMessage = result.result;

  await env.CHIA_DB.put(
    `gamble:${diceMessage.message_id}`,
    JSON.stringify({
      userId: player.id,
      amount,
      createdAt: Date.now()
    }),
    {
      expirationTtl: 300
    }
  );
}


// ======================================================
// DICE RESULT
// ======================================================

async function handleDice(message, env) {
  if (!message.dice) {
    return;
  }

  if (message.dice.emoji !== "🎯") {
    return;
  }

  const gamble =
    await env.CHIA_DB.get(
      `gamble:${message.message_id}`,
      "json"
    );

  if (!gamble) {
    return;
  }

  const player =
    await getPlayer(env, gamble.userId);

  const value = message.dice.value;

  let multiplier = 0;

  if (value === 6) {
    multiplier = 3;
  } else if (value === 5) {
    multiplier = 2;
  } else if (value === 4) {
    multiplier = 1;
  }

  const reward =
    Math.floor(
      gamble.amount * multiplier
    );

  if (reward > 0) {
    player.points += reward;
    player.totalEarned += reward;
  }

  await savePlayer(env, player);

  if (multiplier === 0) {
    await sendMessage(
      env,
      message.chat.id,
      `🎯 <b>باختی!</b>

نتیجه دارت:
${value}

💸 از دست رفت:
${format(gamble.amount)}`
    );
  } else {
    await sendMessage(
      env,
      message.chat.id,
      `🎯 <b>بردی!</b>

نتیجه:
${value}

ضریب:
<b>x${multiplier}</b>

💰 جایزه:
<b>${format(reward)}</b>`
    );
  }

  await env.CHIA_DB.delete(
    `gamble:${message.message_id}`
  );
}


// ======================================================
// LEADERBOARD
// ======================================================

async function leaderboard(env, chatId) {
  const list = [];

  let cursor;

  do {
    const result =
      await env.CHIA_DB.list({
        prefix: "player:",
        cursor
      });

    for (const key of result.keys) {
      const player =
        await env.CHIA_DB.get(
          key.name,
          "json"
        );

      if (player) {
        collectPassiveIncome(player);
        list.push(player);
      }
    }

    cursor =
      result.list_complete
        ? undefined
        : result.cursor;

  } while (cursor);

  list.sort(
    (a, b) => b.points - a.points
  );

  const top = list.slice(0, 10);

  if (top.length === 0) {
    await sendMessage(
      env,
      chatId,
      `🏆 هنوز بازیکنی ثبت نشده است.`
    );

    return;
  }

  let text =
    `🏆 <b>جدول برترین‌های Chia</b>\n\n`;

  for (let i = 0; i < top.length; i++) {
    const player = top[i];

    text +=
      `${i + 1}. 👤 <code>${player.id}</code>\n` +
      `💰 ${format(player.points)} پوینت\n\n`;
  }

  await sendMessage(
    env,
    chatId,
    text
  );
}


// ======================================================
// HELP
// ======================================================

async function sendHelp(env, chatId) {
  await sendMessage(
    env,
    chatId,
    `📚 <b>راهنمای Chia Games</b>

🎮 /game
صفحه اصلی بازی

👤 /profile
پروفایل

💰 /balance
موجودی

🌾 /farm
مزرعه

🏭 /factory
کارخانه

⬆️ /upgradefarm
ارتقای مزرعه

⬆️ /upgradefactory
ارتقای کارخانه

🐶 /pet
دریافت پاداش پت

🏦 /bank
بانک

💵 /invest 1000
سرمایه‌گذاری

💰 /withdraw
برداشت سرمایه

🎯 /gamble 100
قمار

🥷 /steal
سرقت از بازیکن
(با Reply)

💸 /transfer 100
انتقال پوینت
(با Reply)

🏆 /top
جدول برترین‌ها`
  );
}


// ======================================================
// UTILITIES
// ======================================================

function format(number) {
  return Number(number || 0)
    .toLocaleString("en-US");
}


function formatTime(ms) {
  const totalSeconds =
    Math.ceil(ms / 1000);

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  return `${hours}س ${minutes}د ${seconds}ث`;
}


function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
