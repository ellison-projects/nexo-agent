function required(name: string): string {
      const value = process.env[name];
      if (!value) throw new Error(`Missing required env var: ${name}`);
      return value;
}

function optional(name: string): string | undefined {
      const value = process.env[name];
      return value && value.length > 0 ? value : undefined;
}

export const env = {
      telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
      telegramReminderBotToken: required('TELEGRAM_REMINDER_BOT_TOKEN'),
      telegramChatId: required('TELEGRAM_CHAT_ID'),
      nexoApiKey: required('NEXO_API_KEY'),
      nexoUser: required('NEXO_USER'),
      // Only required by the nexo-reminders app. Left optional here so the
      // main agent and web server don't fail to boot when it's unset.
      calendarFeedUrl: optional('NEXO_CALENDAR_FEED_URL'),
};
