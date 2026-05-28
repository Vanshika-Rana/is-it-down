const axios = require("axios");
const cron = require("node-cron");
const { query } = require("./db");
const { setLatestStatus } = require("./cache");

let task = null;
let isRunningCheck = false;

function deriveStatus(statusCode) {
  return statusCode >= 200 && statusCode < 400 ? "up" : "down";
}

async function openIncidentIfNeeded(monitorId) {
  const openIncident = await query(
    `SELECT id FROM incidents WHERE monitor_id = $1 AND resolved_at IS NULL LIMIT 1`,
    [monitorId]
  );

  if (openIncident.rowCount === 0) {
    await query(
      `INSERT INTO incidents (monitor_id, started_at) VALUES ($1, NOW())`,
      [monitorId]
    );
  }
}

async function resolveIncidentIfNeeded(monitorId) {
  await query(
    `
      UPDATE incidents
      SET resolved_at = NOW()
      WHERE monitor_id = $1
        AND resolved_at IS NULL
    `,
    [monitorId]
  );
}

async function runChecks() {
  if (isRunningCheck) {
    return;
  }
  isRunningCheck = true;

  try {
    const monitors = await query(
      `SELECT id, name, url, created_at FROM monitors ORDER BY id ASC`
    );

    for (const monitor of monitors.rows) {
      const startedAt = Date.now();
      let status = "down";
      let statusCode = null;
      let responseTimeMs = null;

      try {
        const response = await axios.get(monitor.url, {
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: () => true,
        });

        responseTimeMs = Date.now() - startedAt;
        statusCode = response.status;
        status = deriveStatus(response.status);
      } catch (error) {
        responseTimeMs = Date.now() - startedAt;
      }

      await query(
        `
          INSERT INTO checks (monitor_id, status, response_time_ms, status_code, checked_at)
          VALUES ($1, $2, $3, $4, NOW())
        `,
        [monitor.id, status, responseTimeMs, statusCode]
      );

      if (status === "down") {
        await openIncidentIfNeeded(monitor.id);
      } else {
        await resolveIncidentIfNeeded(monitor.id);
      }

      await setLatestStatus(monitor.id, {
        status,
        responseTimeMs,
        statusCode,
        checkedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Worker cycle failed:", error.message);
  } finally {
    isRunningCheck = false;
  }
}

function startWorker() {
  if (task) {
    return task;
  }

  task = cron.schedule("*/60 * * * * *", () => {
    runChecks();
  });

  runChecks();
  return task;
}

function stopWorker() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = {
  startWorker,
  stopWorker,
};
