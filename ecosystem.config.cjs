/**
 * pm2 进程管理配置（生产部署用）
 *
 * 用法：
 *   1) 服务器上：npm ci && npm run build
 *   2) pm2 start ecosystem.config.cjs          # 启动
 *   3) pm2 save                                # 保存进程列表（开机自启）
 *   4) pm2 startup                             # 生成开机自启脚本（按提示执行）
 *
 * 更新代码后：
 *   git pull && npm ci && npm run build && pm2 reload rxswap
 *
 * 端口说明：next start 默认 3000（与 dev 的 3001 不同），这里显式指定。
 * 环境变量：next start 会自动读取同目录的 .env.production，无需在此重复写。
 */
module.exports = {
  apps: [
    {
      name: "rxswap",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      // 单实例足够；若服务器多核且想分摊负载，可改：
      //   exec_mode: "cluster", instances: "max"
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 1000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // 也可把 RPC 直接写进 pm2（代替 .env.production 文件）：
      // env_production: {
      //   NODE_ENV: "production",
      //   NEXT_PUBLIC_BSC_RPC: "https://your-bsc-rpc",
      //   NEXT_PUBLIC_BSC_TESTNET_RPC: "https://your-bsc-testnet-rpc",
      //   NEXT_PUBLIC_ARB_RPC: "https://your-arb-rpc",
      //   NEXT_PUBLIC_ARB_SEPOLIA_RPC: "https://your-arb-sepolia-rpc",
      // },
      error_file: "./logs/rxswap-error.log",
      out_file: "./logs/rxswap-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
