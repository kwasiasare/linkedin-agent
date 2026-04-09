/**
 * Reporting module — weekly analytics and lead pipeline reports
 */

import { getOrgPosts, getPostStats, getFollowerStats } from './linkedin.js';
import { generateWeeklyReport } from './content.js';
import { getLeadSummary } from './leads.js';
import { logger } from './logger.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run the weekly report — aggregates all stats and generates a summary
 */
export async function runWeeklyReport() {
  logger.info('Generating weekly report...');

  const posts  = await getOrgPosts(20);
  const leadSummary = getLeadSummary();

  // Collect post stats for this week
  const weekAgo     = Date.now() - 7 * 86400000;
  const recentPosts = posts.filter(p => {
    const created = p.createdAt || 0;  // fix #18: new Posts API uses createdAt
    return created > weekAgo;
  });

  const postMetrics = [];
  for (const post of recentPosts) {
    try {
      const stats = await getPostStats(post.id);
      const text  = (post.commentary || '').slice(0, 80);  // fix #16: new Posts API field
      postMetrics.push({
        id:          post.id,
        preview:     text,
        likes:       stats.numLikes || 0,
        comments:    stats.numComments || 0,
        shares:      stats.numShares || 0,
        impressions: stats.impressionCount || 0,
      });
    } catch (err) {
      logger.error(`Could not get stats for post ${post.id}: ${err.message}`);
    }
  }

  // Sort by engagement
  postMetrics.sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares));

  let followerCount = 'N/A';
  try {
    const followerStats = await getFollowerStats();
    followerCount = followerStats.firstDegreeSize || 'N/A';
  } catch (err) {
    logger.error(`Could not get follower stats: ${err.message}`);
  }

  const stats = {
    week_ending:    new Date().toISOString().split('T')[0],
    followers:      followerCount,
    posts_this_week: recentPosts.length,
    total_posts_in_period: posts.length,
    top_posts:      postMetrics.slice(0, 3),
    all_posts:      postMetrics,
    lead_pipeline:  leadSummary,
  };

  // Generate AI summary
  const reportText = await generateWeeklyReport(stats);

  // Save report
  const filename = `report_${new Date().toISOString().split('T')[0]}.md`;
  const filepath = join(__dirname, '../logs', filename);

  const fullReport = `# Spreadcom LLC — LinkedIn Weekly Report\n**Generated:** ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST\n\n${reportText}\n\n---\n\n## Raw Data\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`;

  mkdirSync(join(__dirname, '../logs'), { recursive: true }); // ISSUE-14: ensure logs/ exists
  writeFileSync(filepath, fullReport);
  logger.info(`Weekly report saved to: ${filepath}`);

  console.log('\n' + fullReport);
  return { reportText, stats, filepath };
}
