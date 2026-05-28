const path = require("path");
const express = require("express");
const { query } = require("./db");
const { deleteLatestStatus, getLatestStatus } = require("./cache");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/api/monitors", async (_req, res) => {
  try {
    const monitorsResult = await query(
      `SELECT id, name, url, created_at FROM monitors ORDER BY id ASC`
    );

    const checksSummary = await query(`
      SELECT
        monitor_id,
        COUNT(*)::int AS total_checks,
        COUNT(*) FILTER (WHERE status = 'up')::int AS up_checks
      FROM checks
      WHERE checked_at >= NOW() - INTERVAL '24 hours'
      GROUP BY monitor_id
    `);

    const summaryByMonitorId = new Map(
      checksSummary.rows.map((row) => [row.monitor_id, row])
    );

    const data = await Promise.all(
      monitorsResult.rows.map(async (monitor) => {
        const latest = await getLatestStatus(monitor.id);
        const summary = summaryByMonitorId.get(monitor.id);
        const totalChecks = summary ? summary.total_checks : 0;
        const upChecks = summary ? summary.up_checks : 0;
        const uptimePct =
          totalChecks > 0 ? Number(((upChecks / totalChecks) * 100).toFixed(2)) : null;

        return {
          ...monitor,
          latestStatus: latest,
          uptime24hPct: uptimePct,
        };
      })
    );

    res.json(data);
  } catch (error) {
    console.error("Failed to list monitors:", error.message);
    res.status(500).json({ error: "Failed to list monitors" });
  }
});

app.post("/api/monitors", async (req, res) => {
  const { name, url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid URL is required" });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    return res.status(400).json({ error: "URL is invalid" });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: "URL must use HTTP or HTTPS" });
  }

  const monitorName = name && typeof name === "string" ? name.trim() : parsedUrl.hostname;

  try {
    const result = await query(
      `
        INSERT INTO monitors (name, url)
        VALUES ($1, $2)
        RETURNING id, name, url, created_at
      `,
      [monitorName || parsedUrl.hostname, parsedUrl.toString()]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Monitor already exists" });
    }
    console.error("Failed to create monitor:", error.message);
    return res.status(500).json({ error: "Failed to create monitor" });
  }
});

app.delete("/api/monitors/:id", async (req, res) => {
  const monitorId = Number(req.params.id);
  if (!Number.isInteger(monitorId)) {
    return res.status(400).json({ error: "Invalid monitor id" });
  }

  try {
    const result = await query(
      `DELETE FROM monitors WHERE id = $1 RETURNING id`,
      [monitorId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    await deleteLatestStatus(monitorId);
    return res.status(204).send();
  } catch (error) {
    console.error("Failed to delete monitor:", error.message);
    return res.status(500).json({ error: "Failed to delete monitor" });
  }
});

app.get("/api/monitors/:id/history", async (req, res) => {
  const monitorId = Number(req.params.id);
  if (!Number.isInteger(monitorId)) {
    return res.status(400).json({ error: "Invalid monitor id" });
  }

  try {
    const history = await query(
      `
        SELECT id, monitor_id, status, response_time_ms, status_code, checked_at
        FROM checks
        WHERE monitor_id = $1
          AND checked_at >= NOW() - INTERVAL '24 hours'
        ORDER BY checked_at DESC
      `,
      [monitorId]
    );

    return res.json(history.rows);
  } catch (error) {
    console.error("Failed to fetch monitor history:", error.message);
    return res.status(500).json({ error: "Failed to fetch monitor history" });
  }
});

let server = null;

function startServer() {
  if (server) {
    return server;
  }

  server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  return server;
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  app,
  startServer,
  stopServer,
};
