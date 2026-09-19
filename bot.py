import asyncio
import logging
import os
import random
import sqlite3
from datetime import datetime, date

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder

TOKEN = os.getenv("BOT_TOKEN")
DB_PATH = os.getenv("DB_PATH", "chia_games.db")

if not TOKEN:
    raise RuntimeError("BOT_TOKEN environment variable is missing.")

logging.basicConfig(level=logging.INFO)
bot = Bot(TOKEN)
dp = Dispatcher()

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

def db_init():
    conn.execute("""
    CREATE TABLE IF NOT EXISTS players (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        name TEXT NOT NULL,
        coins INTEGER NOT NULL DEFAULT 100,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        food INTEGER NOT NULL DEFAULT 70,
        water INTEGER NOT NULL DEFAULT 70,
        last_daily TEXT
    )
    """)
    conn.commit()

def get_player(user_id: int, name: str, username: str | None):
    row = conn.execute("SELECT * FROM players WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        conn.execute(
            "INSERT INTO players(user_id, username, name) VALUES (?, ?, ?)",
            (user_id, username, name)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM players WHERE user_id=?", (user_id,)).fetchone()
    else:
        conn.execute(
            "UPDATE players SET name=?, username=? WHERE user_id=?",
            (name, username, user_id)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM players WHERE user_id=?", (user_id,)).fetchone()
    return row

def refresh_level(user_id: int):
    row = conn.execute("SELECT xp, level FROM players WHERE user_id=?", (user_id,)).fetchone()
    new_level = max(1, row["xp"] // 100 + 1)
    if new_level != row["level"]:
        conn.execute("UPDATE players SET level=? WHERE user_id=?", (new_level, user_id))
        conn.commit()
    return new_level

def profile_text(row):
    return (
        f"🐶 <b>پروفایل چیا گیمز</b>\n\n"
        f"👤 نام: {row['name']}\n"
        f"⭐ سطح: {row['level']}\n"
        f"✨ تجربه: {row['xp']} XP\n"
        f"💰 سکه: {row['coins']}\n"
        f"🍖 غذا: {row['food']}/100\n"
        f"💧 آب: {row['water']}/100"
    )

def main_keyboard():
    b = InlineKeyboardBuilder()
    b.button(text="🐶 پروفایل", callback_data="profile")
    b.button(text="🍖 غذا دادن", callback_data="feed")
    b.button(text="💧 آب دادن", callback_data="water")
    b.button(text="🎁 جایزه روزانه", callback_data="daily")
    b.button(text="🎲 کار تصادفی", callback_data="work")
    b.button(text="🏆 رتبه‌بندی", callback_data="ranking")
    b.adjust(2, 2, 2)
    return b.as_markup()

@dp.message(CommandStart())
async def start(message: Message):
    user = message.from_user
    row = get_player(user.id, user.full_name, user.username)
    await message.answer(
        "🎮 <b>به چیا گیمز خوش آمدی!</b>\n\n"
        "هاپوی خودت را مدیریت کن، سکه جمع کن و سطح خودت را بالا ببر.\n"
        "برای بازی در گروه، ربات را به گروه اضافه کن و از دستور /game استفاده کن.",
        reply_markup=main_keyboard()
    )

@dp.message(Command("game"))
async def game(message: Message):
    user = message.from_user
    get_player(user.id, user.full_name, user.username)
    await message.answer(
        f"🎮 <b>چیا گیمز شروع شد!</b>\n"
        f"بازیکن: {user.full_name}\n\n"
        "از دکمه‌های زیر استفاده کن:",
        reply_markup=main_keyboard()
    )

@dp.message(Command("profile"))
async def profile(message: Message):
    user = message.from_user
    row = get_player(user.id, user.full_name, user.username)
    await message.answer(profile_text(row))

@dp.callback_query(F.data == "profile")
async def cb_profile(call: CallbackQuery):
    user = call.from_user
    row = get_player(user.id, user.full_name, user.username)
    await call.message.edit_text(profile_text(row), reply_markup=main_keyboard())
    await call.answer()

@dp.callback_query(F.data == "feed")
async def cb_feed(call: CallbackQuery):
    user = call.from_user
    get_player(user.id, user.full_name, user.username)
    row = conn.execute("SELECT food, xp FROM players WHERE user_id=?", (user.id,)).fetchone()
    if row["food"] >= 100:
        await call.answer("غذای هاپو پر است! 🍖", show_alert=True)
        return
    food = min(100, row["food"] + 15)
    xp = row["xp"] + 10
    conn.execute("UPDATE players SET food=?, xp=? WHERE user_id=?", (food, xp, user.id))
    conn.commit()
    refresh_level(user.id)
    await call.answer("هاپو غذا خورد! +10 XP 🍖")
    await call.message.edit_text(profile_text(get_player(user.id, user.full_name, user.username)),
                                  reply_markup=main_keyboard())

@dp.callback_query(F.data == "water")
async def cb_water(call: CallbackQuery):
    user = call.from_user
    get_player(user.id, user.full_name, user.username)
    row = conn.execute("SELECT water, xp FROM players WHERE user_id=?", (user.id,)).fetchone()
    if row["water"] >= 100:
        await call.answer("آب هاپو پر است! 💧", show_alert=True)
        return
    water = min(100, row["water"] + 15)
    xp = row["xp"] + 10
    conn.execute("UPDATE players SET water=?, xp=? WHERE user_id=?", (water, xp, user.id))
    conn.commit()
    refresh_level(user.id)
    await call.answer("هاپو آب خورد! +10 XP 💧")
    await call.message.edit_text(profile_text(get_player(user.id, user.full_name, user.username)),
                                  reply_markup=main_keyboard())

@dp.callback_query(F.data == "daily")
async def cb_daily(call: CallbackQuery):
    user = call.from_user
    get_player(user.id, user.full_name, user.username)
    today = date.today().isoformat()
    row = conn.execute("SELECT coins, last_daily FROM players WHERE user_id=?", (user.id,)).fetchone()
    if row["last_daily"] == today:
        await call.answer("جایزه امروزت را قبلاً گرفتی! 🎁", show_alert=True)
        return
    reward = random.randint(50, 120)
    conn.execute("UPDATE players SET coins=coins+?, last_daily=? WHERE user_id=?",
                 (reward, today, user.id))
    conn.commit()
    await call.answer(f"تبریک! {reward} سکه گرفتی 🎁")
    await call.message.edit_text(profile_text(get_player(user.id, user.full_name, user.username)),
                                  reply_markup=main_keyboard())

@dp.callback_query(F.data == "work")
async def cb_work(call: CallbackQuery):
    user = call.from_user
    get_player(user.id, user.full_name, user.username)
    reward = random.randint(10, 60)
    xp = random.randint(5, 20)
    conn.execute("UPDATE players SET coins=coins+?, xp=?+xp WHERE user_id=?",
                 (reward, xp, user.id))
    conn.commit()
    refresh_level(user.id)
    await call.answer(f"کار انجام شد! +{reward} سکه و +{xp} XP 🎲")
    await call.message.edit_text(profile_text(get_player(user.id, user.full_name, user.username)),
                                  reply_markup=main_keyboard())

@dp.callback_query(F.data == "ranking")
async def cb_ranking(call: CallbackQuery):
    rows = conn.execute(
        "SELECT name, level, coins, xp FROM players ORDER BY level DESC, xp DESC, coins DESC LIMIT 10"
    ).fetchall()
    text = "🏆 <b>۱۰ بازیکن برتر چیا گیمز</b>\n\n"
    if not rows:
        text += "هنوز بازیکنی ثبت نشده است."
    else:
        for i, row in enumerate(rows, 1):
            text += f"{i}. {row['name']} — سطح {row['level']} | 💰 {row['coins']}\n"
    await call.message.edit_text(text, reply_markup=main_keyboard())
    await call.answer()

async def main():
    db_init()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
