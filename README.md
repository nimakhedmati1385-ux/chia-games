# چیا گیمز | Chia Games

نسخه پایه ربات بازی گروهی تلگرام با Python، aiogram و SQLite.

## امکانات فعلی
- پروفایل اختصاصی هر بازیکن
- سکه، XP و سطح
- غذا و آب
- جایزه روزانه
- فعالیت تصادفی برای دریافت سکه و XP
- جدول رتبه‌بندی
- اجرای بازی در گروه با دستور `/game`

## نصب

Python 3.10 یا جدیدتر نصب کنید:

```bash
python -m venv .venv
```

فعال‌سازی محیط مجازی:

Linux/macOS:
```bash
source .venv/bin/activate
```

Windows:
```bash
.venv\Scripts\activate
```

نصب وابستگی‌ها:

```bash
pip install -r requirements.txt
```

## ساخت توکن ربات

در تلگرام به `@BotFather` بروید، دستور `/newbot` را اجرا کنید و توکن را دریافت کنید.

سپس متغیر محیطی `BOT_TOKEN` را تنظیم کنید.

Linux/macOS:
```bash
export BOT_TOKEN="توکن_ربات_اینجا"
python bot.py
```

Windows PowerShell:
```powershell
$env:BOT_TOKEN="توکن_ربات_اینجا"
python bot.py
```

## افزودن به گروه

1. ربات را به گروه اضافه کنید.
2. دستور `/game` را بفرستید.
3. اعضا روی دکمه‌ها بزنند و بازی کنند.

برای نسخه‌های بعدی می‌توان فروشگاه، کارخانه، بانک، حیوانات مختلف، مأموریت‌ها، دعوت دوستان و پنل ادمین را اضافه کرد.
