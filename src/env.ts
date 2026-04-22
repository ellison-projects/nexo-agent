function required(name: string): string {
      const value = process.env[name];
      if (!value) throw new Error(`Missing required env var: ${name}`);
      return value;
}

export const env = {
      telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
      telegramReminderBotToken: required('TELEGRAM_REMINDER_BOT_TOKEN'),
      telegramChatId: required('TELEGRAM_CHAT_ID'),
      nexoApiKey: required('NEXO_API_KEY'),
      nexoUser: required('NEXO_USER'),
};
