function required(name: string): string {
      const value = process.env[name];
      if (!value) throw new Error(`Missing required env var: ${name}`);
      return value;
}

export const debugEnv = {
      telegramBotToken: required('DEBUG_TELEGRAM_BOT_TOKEN'),
      telegramChatId: required('DEBUG_TELEGRAM_CHAT_ID'),
};
