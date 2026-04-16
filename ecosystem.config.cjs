module.exports = {
      apps: [
            {
                  name: 'telegram-bot',
                  script: 'npm.cmd',
                  args: 'run dev',
                  autorestart: true,
                  max_restarts: 10,
                  restart_delay: 3000,
                  min_uptime: '10s',
                  max_memory_restart: '300M',
                  time: true,
            },
      ],
};
