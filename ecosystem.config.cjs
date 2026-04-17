module.exports = {
      apps: [
            {
                  name: 'telegram-bot',
                  script: 'node_modules/tsx/dist/cli.mjs',
                  args: '--env-file=.env src/index.ts',
                  instances: 1,
                  exec_mode: 'fork',
                  autorestart: true,
                  max_restarts: 10,
                  restart_delay: 3000,
                  min_uptime: '10s',
                  max_memory_restart: '300M',
                  time: true,
            },
      ],
};
