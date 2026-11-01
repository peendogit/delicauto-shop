module.exports = {
  apps: [{
    name: 'delicauto-shop',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_memory_restart: '400M',
    // .env se čita iz foldera (PORT=3010 itd.)
  }],
};
