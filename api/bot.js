const BOT_TOKEN = process.env.BOT_TOKEN;

const MINI_APP_URL = "https://voll-trend.vercel.app";

const FIREBASE_URL =
  "https://volltrend-33497-default-rtdb.europe-west1.firebasedatabase.app";

const TRAINING_ID = "30-08-2026";
const MAX_PLACES = 12;
const PRICE = 400;

const BOOKINGS_URL =
  `${FIREBASE_URL}/trainings/${TRAINING_ID}/bookings.json`;

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "👥 Список записавшихся",
          callback_data: "show_bookings"
        }
      ],
      [
        {
          text: "🏐 Открыть приложение",
          web_app: {
            url: MINI_APP_URL
          }
        }
      ]
    ]
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "⬅️ Назад",
          callback_data: "back_to_menu"
        }
      ]
    ]
  };
}

async function telegram(method, body) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN не найден в Environment Variables");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Ошибка Telegram API");
  }

  return data;
}

async function getBookings() {
  const response = await fetch(BOOKINGS_URL);

  if (!response.ok) {
    throw new Error("Не удалось получить данные Firebase");
  }

  const data = await response.json();

  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.entries(data).map(([key, booking]) => ({
    key,
    ...booking
  }));
}

function sortBookings(bookings) {
  return bookings.sort((a, b) => {
    const first = Number(a.createdAt || 0);
    const second = Number(b.createdAt || 0);

    return first - second;
  });
}

function getBookingStatus(bookings, booking) {
  const sorted = sortBookings([...bookings]);

  const index = sorted.findIndex(
    item => item.key === booking.key
  );

  return index < MAX_PLACES ? "booked" : "waitlist";
}

function formatUsername(booking) {
  if (booking.username) {
    return `@${String(booking.username).replace(/^@/, "")}`;
  }

  if (booking.firstName) {
    return booking.firstName;
  }

  return `Пользователь ${booking.telegramId || ""}`;
}

function makeBookingsText(bookings) {
  const sorted = sortBookings([...bookings]);

  const booked = sorted
    .map((booking, index) => ({
      ...booking,
      actualStatus: getBookingStatus(sorted, booking),
      number: index + 1
    }))
    .filter(booking => booking.actualStatus === "booked");

  const waitlist = sorted
    .map((booking, index) => ({
      ...booking,
      actualStatus: getBookingStatus(sorted, booking),
      number: index + 1
    }))
    .filter(booking => booking.actualStatus === "waitlist");

  let text =
    "🏐 <b>VollTrend</b>\n\n" +
    "📅 <b>Тренировка:</b> 30 августа 2026\n" +
    "🕗 <b>Время:</b> 20:00\n" +
    "📍 <b>Место:</b> ГТС\n" +
    `💰 <b>Стоимость:</b> ${PRICE} ₽\n\n`;

  text += `👥 <b>Записались: ${booked.length}/${MAX_PLACES}</b>\n\n`;

  if (booked.length === 0) {
    text += "Пока никто не записался.\n";
  } else {
    booked.forEach((booking, index) => {
      const paidMark = booking.paid === true ? " ✅" : "";

      text += `${index + 1}. ${formatUsername(booking)}${paidMark}\n`;
    });
  }

  if (waitlist.length > 0) {
    text += "\n⏳ <b>Очередь:</b>\n";

    waitlist.forEach((booking, index) => {
      const paidMark = booking.paid === true ? " ✅" : "";

      text += `${index + 1}. ${formatUsername(booking)}${paidMark}\n`;
    });
  }

  text +=
    "\n✅ — оплата подтверждена\n" +
    "Без отметки — оплата ещё не подтверждена.";

  return text;
}

async function sendMenu(chatId, messageId = null) {
  const body = {
    chat_id: chatId,
    text:
      "🏐 <b>VollTrend</b>\n\n" +
      "Выбери действие:",
    parse_mode: "HTML",
    reply_markup: menuKeyboard()
  };

  if (messageId) {
    body.message_id = messageId;

    return telegram("editMessageText", body);
  }

  return telegram("sendMessage", body);
}

async function sendBookings(chatId, messageId = null) {
  const bookings = await getBookings();

  const body = {
    chat_id: chatId,
    text: makeBookingsText(bookings),
    parse_mode: "HTML",
    reply_markup: backKeyboard()
  };

  if (messageId) {
    body.message_id = messageId;

    return telegram("editMessageText", body);
  }

  return telegram("sendMessage", body);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({
        ok: true,
        message: "VollTrend bot is working"
      });
    }

    const update = req.body;

    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || "";

      if (text === "/start") {
        await sendMenu(chatId);
      }

      return res.status(200).json({
        ok: true
      });
    }

    if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message.chat.id;
      const messageId = callback.message.message_id;
      const callbackId = callback.id;

      await telegram("answerCallbackQuery", {
        callback_query_id: callbackId
      });

      if (callback.data === "show_bookings") {
        await sendBookings(chatId, messageId);
      }

      if (callback.data === "back_to_menu") {
        await sendMenu(chatId, messageId);
      }

      return res.status(200).json({
        ok: true
      });
    }

    return res.status(200).json({
      ok: true
    });
  } catch (error) {
    console.error("BOT ERROR:", error);

    return res.status(200).json({
      ok: false,
      error: error.message
    });
  }
}
