module.exports = {
  apps: [
    {
      name: "zoommate-frontend",
      cwd: "/opt/zoommate/frontend",
      script: "npm",
      args: "start",
      instances: 2,
      exec_mode: "cluster",
      env: {
        PORT: 3000,
        NODE_ENV: "production"
      }
    },
    {
      name: "zoommate-backend",
      cwd: "/opt/zoommate/backend",
      script: "venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000 --workers 4",
      env: {
        PYTHONPATH: "/opt/zoommate/backend",
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL
      }
    },
    {
      name: "zoommate-scraper",
      cwd: "/opt/zoommate",
      script: "/opt/zoommate/scraper/venv/bin/python",
      args: "-m scraper.scheduler",
      env: {
        PYTHONPATH: "/opt/zoommate",
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL
      },
      instances: 1,
      autorestart: true
    }
  ]
};
