module.exports = {
  apps: [{
    name: 'BackendDeliveryApp',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '120M',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    }
  }]
}