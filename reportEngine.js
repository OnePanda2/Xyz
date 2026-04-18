/**
 * ScrollSense — Step 6: Automated Report Engine
 *
 * What this does:
 *   - Runs a cron job that activates on a schedule (e.g. every 3 days)
 *   - Fetches all users and their respective recorded reels from Supabase
 *   - Aggregates behavioral data (which niches are consumed by which demographics)
 *   - Saves a clean, structured JSON report into the 'reports' database table
 *
 * Usage:
 *   node reportEngine.js
 */

require('dotenv').config();
const cron = require('node-cron');
const pb = require('./pocketbase');

async function generateReport() {
  console.log('─────────────────────────────────────────────');
  console.log('[REPORT ENGINE] Generating Demographic Insight Report...');
  console.log('─────────────────────────────────────────────\n');

  try {
    // 1. Fetch all users and expand their array of reels magnetically linked via Back-Relations
    let users = [];
    try {
      users = await pb.collection('users').getFullList({
        expand: 'reels_via_user'
      });
    } catch (err) {
      console.warn("Could not fetch users or no users found.");
    }

    // Filter out users who haven't logged any reels yet
    const activeUsers = users.filter(u => u.expand && u.expand.reels_via_user && u.expand.reels_via_user.length > 0);
    
    // Map the expanded array to u.reels so the rest of the parsing logic stays the exact same
    activeUsers.forEach(u => u.reels = u.expand.reels_via_user);

    if (activeUsers.length === 0) {
      console.log('⚠️ [WARNING] No reels found in the database. Send more reels via WhatsApp to test!');
      return;
    }

    // 2. Aggregate data by Profession (Our Demographic Filter logic)
    const summary = {};
    let totalReelsAnalyzed = 0;

    activeUsers.forEach(user => {
      // Normalize demographic key
      const demoKey = user.profession ? user.profession.toLowerCase() : 'unknown demographic';
      
      if (!summary[demoKey]) {
        summary[demoKey] = {
           users_tracked: 0,
           top_niches: {},
           top_platforms: {}
        };
      }

      summary[demoKey].users_tracked += 1;

      // Increment counts based on the user's reels
      user.reels.forEach(reel => {
         totalReelsAnalyzed++;
         
         const niche = reel.niche ? reel.niche.toLowerCase() : 'general';
         summary[demoKey].top_niches[niche] = (summary[demoKey].top_niches[niche] || 0) + 1;
         
         const platform = reel.platform ? reel.platform.toLowerCase() : 'instagram';
         summary[demoKey].top_platforms[platform] = (summary[demoKey].top_platforms[platform] || 0) + 1;
      });
    });

    // 3. Format the Object map into a clean, Dashboard-friendly JSON array
    const formattedSummary = Object.keys(summary).map(demo => {
       return {
          demographic: demo,
          users_tracked: summary[demo].users_tracked,
          niches: Object.entries(summary[demo].top_niches).sort((a,b) => b[1] - a[1]).map(n => ({ name: n[0], count: n[1] })),
          platforms: Object.entries(summary[demo].top_platforms).sort((a,b) => b[1] - a[1]).map(p => ({ name: p[0], count: p[1] }))
       };
    });

    console.log(`[DB] Aggregated ${totalReelsAnalyzed} reels across ${activeUsers.length} demographics.`);

    // 4. Save to the Reports table
    const reportData = {
      demographic_filter: { type: "profession", tracked_count: activeUsers.length },
      summary: JSON.stringify(formattedSummary), // Ensure it fits the JSONB format
      sent_to: []
    };

    const report = await pb.collection('reports').create(reportData);

    console.log('\n✅ [SUCCESS] Report automatically generated and saved to Supabase!');
    console.log(`Report ID: ${report.id}`);
    console.log('\nPreview of summary:');
    console.log(JSON.stringify(formattedSummary, null, 2));

  } catch (error) {
    console.error('\n❌ [FAILED] Report Engine crashed:', error.message);
  }
}

// ─── CRON SCHEDULING ────────────────────────────────────────────────────────
// This tests immediately when the script is run
(async () => {
  await generateReport();
  
  // Set up standard cron job: Runs every 3 days at 10:00 AM
  cron.schedule('0 10 */3 * *', () => {
    console.log('[CRON] Automated schedule trigged. Firing report generation...');
    generateReport();
  });
  
  console.log('\n[CRON] Job safely scheduled. (Press Ctrl+C to exit this standalone POC)');
})();
