const Redis = require("ioredis");

const cache = new Redis({
  host: process.env.CACHE_HOST || "cache",
  port: Number(process.env.CACHE_PORT || 6379),
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

async function ensureConnected() {
  if (cache.status === "wait") {
    await cache.connect();
  }
}

async function setLatestStatus(monitorId, payload) {
  await ensureConnected();
  await cache.set(`monitor:${monitorId}:latest`, JSON.stringify(payload));
}

async function getLatestStatus(monitorId) {
  await ensureConnected();
  const value = await cache.get(`monitor:${monitorId}:latest`);
  return value ? JSON.parse(value) : null;
}

async function deleteLatestStatus(monitorId) {
  await ensureConnected();
  await cache.del(`monitor:${monitorId}:latest`);
}

async function closeCache() {
  if (cache.status === "ready" || cache.status === "connect") {
    await cache.quit();
  }
}

module.exports = {
  setLatestStatus,
  getLatestStatus,
  deleteLatestStatus,
  closeCache,
};
