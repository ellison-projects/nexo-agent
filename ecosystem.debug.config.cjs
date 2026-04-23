// Ecosystem for the debug agent only. Kept in its own file so the main
// lifecycle commands (`npm start`, `npm run restart`, `npm run cleanup`,
// `pm2 start ecosystem.config.cjs`) never touch it. Start explicitly with
// `npm run start:debug` or `pm2 start ecosystem.debug.config.cjs`.
module.exports = {
      apps: [
            {
                  name: 'nexo-debug-agent',
                  script: 'node_modules/tsx/dist/cli.mjs',
                  args: '--env-file=.env src/debug/index.ts',
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
