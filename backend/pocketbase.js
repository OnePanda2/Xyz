require('dotenv').config();
const PocketBase = require('pocketbase/cjs');

// 1. Verify existence of PocketBase keys
const pbUrl = process.env.POCKETBASE_URL;
const pbAdminEmail = process.env.PB_ADMIN_EMAIL;
const pbAdminPassword = process.env.PB_ADMIN_PASSWORD;

if (!pbUrl || !pbAdminEmail || !pbAdminPassword) {
  console.error('\n[ERROR] Missing PocketBase Configuration.');
  console.error('Please update POCKETBASE_URL, PB_ADMIN_EMAIL, and PB_ADMIN_PASSWORD in your .env file.\n');
  process.exit(1);
}

// 2. Initialize PocketBase
const pb = new PocketBase(pbUrl);

// Disable auto cancellation so async requests don't cancel each other out
pb.autoCancellation(false);

// 3. Authenticate as Admin for server-side operations
// This authenticates once on startup and stores the token locally
(async () => {
  try {
    await pb.admins.authWithPassword(pbAdminEmail, pbAdminPassword);
    console.log('[DB] Authenticated as PocketBase Admin');
  } catch (err) {
    console.error('\n[ERROR] Failed to authenticate with PocketBase:', err.message);
  }
})();

module.exports = pb;
