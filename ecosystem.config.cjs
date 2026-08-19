module.exports = {
  apps: [
    {
      name: "sala-x4",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
