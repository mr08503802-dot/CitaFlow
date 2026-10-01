/**
 * Centralized Base URL resolution for local and cloud deployments (Render / Railway)
 */
function getBaseUrl() {
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== '') {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }

  // Render automatic external URL injection (https://<service-name>.onrender.com)
  if (process.env.RENDER_EXTERNAL_URL && process.env.RENDER_EXTERNAL_URL.trim() !== '') {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }

  // Railway automatic public domain injection
  if (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN.trim() !== '') {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN.replace(/\/$/, '');
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }

  if (process.env.RAILWAY_STATIC_URL && process.env.RAILWAY_STATIC_URL.trim() !== '') {
    const domain = process.env.RAILWAY_STATIC_URL.replace(/\/$/, '');
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

module.exports = {
  getBaseUrl,
};
