/**
 * Spreadcom LLC — LinkedIn Agent
 * Main orchestrator: schedules and runs all agent tasks
 *
 * Usage:
 *   node src/agent.js              → start full scheduled agent (daemon mode)
 *   node src/agent.js --task post  → run one post immediately
 *   node src/agent.js --task engage → run engagement cycle immediately
 *   node src/agent.js --task report → generate weekly report immediately
 */

import 'dotenv/config';
import cron from 'node-cron';
import { createPost } from './linkedin.js';
import { generateDailyPost } from './content.js';
import { runEngagementCycle } from './engage.js';
import { runWeeklyReport } from './report.js';
import { logger } from './logger.js';

// ─── VALIDATION ──────────────────────────────────────────────────────────────

function validateConfig() {
  const required = [
    'ANTHROPIC_API_KEY',
    'LINKEDIN_CLIENT_ID',
    'LINKEDIN_CLIENT_SECRET',
    'LINKEDIN_ACCESS_TOKEN',
    'LINKEDIN_ORGANIZATION_ID',
    'LINKEDIN_PERSON_URN',
  ];

  const missing = required.filter(k => !process.env[k]);

  if (missing.length > 0) {
    console.error('\n[ERROR] Missing required environment variables:');
    missing.forEach(k => console.error(`  - ${k}`));
    console.error('\nCopy .env.example to .env and fill in your credentials.');
    console.error('Run `npm run auth` to generate your LinkedIn access token.\n');
    process.exit(1);
  }
}

// ─── TASK RUNNERS ────────────────────────────────────────────────────────────

async function runDailyPost() {
  try {
    logger.info('Running daily post task...');
    const { text, pillar, subTopic } = await generateDailyPost();
    const result = await createPost(text);
    logger.info(`Daily post published (pillar: ${pillar}, angle: ${subTopic}) — ID: ${result.id}`);
    console.log(`\nPost published successfully.\nPillar: ${pillar}\nAngle: ${subTopic}\nPost ID: ${result.id}\n`);
    console.log('Content preview:\n' + text.slice(0, 200) + '...\n');
  } catch (err) {
    logger.error(`Daily post failed: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
    throw err;
  }
}

async function runEngagement() {
  try {
    logger.info('Running engagement cycle...');
    const result = await runEngagementCycle();
    logger.info(`Engagement cycle done — replies: ${result.replied_count}, leads: ${result.leads_found}`);
  } catch (err) {
    logger.error(`Engagement cycle failed: ${err.message}`);
    throw err;
  }
}

async function runReport() {
  try {
    logger.info('Running weekly report...');
    await runWeeklyReport();
  } catch (err) {
    logger.error(`Weekly report failed: ${err.message}`);
    throw err;
  }
}

// ─── CLI MODE ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const taskFlag = args.indexOf('--task');

if (taskFlag !== -1) {
  validateConfig();
  const task = args[taskFlag + 1];

  const tasks = {
    post:    runDailyPost,
    engage:  runEngagement,
    report:  runReport,
  };

  if (!tasks[task]) {
    console.error(`Unknown task: "${task}". Valid tasks: post, engage, report`);
    process.exit(1);
  }

  tasks[task]().catch(err => {
    console.error('Task failed:', err.message);
    process.exit(1);
  });

} else {
  // ─── DAEMON / SCHEDULED MODE ──────────────────────────────────────────────

  validateConfig();

  const POST_TIME   = process.env.POST_TIME_CRON   || '0 8 * * 1-5';   // 8:00 AM Mon–Fri
  const ENGAGE_TIME = process.env.ENGAGE_TIME_CRON || '15 8,17 * * 1-5'; // 8:15 AM + 5:15 PM Mon–Fri (ISSUE-09: offset from post time)
  const TZ          = process.env.TIMEZONE         || 'America/New_York';

  logger.info('Spreadcom LinkedIn Agent starting in scheduled mode...');
  logger.info(`Post schedule:    ${POST_TIME} (${TZ})`);
  logger.info(`Engage schedule:  ${ENGAGE_TIME} (${TZ})`);

  // fix #23: validate cron expressions before scheduling
  if (!cron.validate(POST_TIME))   throw new Error(`Invalid POST_TIME_CRON: ${POST_TIME}`);
  if (!cron.validate(ENGAGE_TIME)) throw new Error(`Invalid ENGAGE_TIME_CRON: ${ENGAGE_TIME}`);

  // Daily post — weekdays at 8:00 AM EST
  cron.schedule(POST_TIME, runDailyPost, { timezone: TZ });

  // Engagement cycle — 8:00 AM and 5:00 PM EST, weekdays
  cron.schedule(ENGAGE_TIME, runEngagement, { timezone: TZ });

  // Weekly report — every Friday at 5:30 PM EST
  cron.schedule('30 17 * * 5', runReport, { timezone: TZ });

  logger.info('Agent is running. Press Ctrl+C to stop.');
  console.log('\nSpreadcom LinkedIn Agent is active.\n');
  console.log('Scheduled tasks:');
  console.log(`  Daily post:      ${POST_TIME} ${TZ}`);
  console.log(`  Engagement:      ${ENGAGE_TIME} ${TZ}`);
  console.log(`  Weekly report:   Fridays 5:30 PM ${TZ}\n`);

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Agent stopped by user.');
    process.exit(0);
  });
}
