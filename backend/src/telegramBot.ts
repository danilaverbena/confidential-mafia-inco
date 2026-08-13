import TelegramBot from "node-telegram-bot-api";

export function buildTelegramSender(token: string, chatId: string) {
  const bot = new TelegramBot(token, { polling: false });
  return {
    async send(text: string) {
      await bot.sendMessage(chatId, text);
    },
  };
}
