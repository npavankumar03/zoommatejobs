module.exports = {
  apps: [
    {
      name: "jobfillai-frontend",
      cwd: "/var/www/jobfillai/frontend",
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
      name: "jobfillai-backend",
      cwd: "/var/www/jobfillai/backend",
      script: "venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000 --workers 4",
      env: {
        PYTHONPATH: "/var/www/jobfillai/backend"
      }
    },
    {
      name: "jobfillai-scraper",
      cwd: "/var/www/jobfillai/scraper",
      script: "venv/bin/python",
      args: "scheduler.py",
      instances: 1,
      autorestart: true
    }
  ]
};
