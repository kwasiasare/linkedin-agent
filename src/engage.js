/**
 * Community engagement module
 * Handles comment monitoring, replying, and lead detection
 */

import {
  getOrgPosts,
  getComments,
  replyToComment,
  likePost,
} from './linkedin.js';
import {
  classifyComment,
  generateReply,
  extractLeadInfo,
} from './content.js';
import { logLead } from './leads.js';
import { logger } from './logger.js';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const REPLIED_FILE = join(__dirname, '../data/replied_comments.json');

function loadReplied() {
  if (!existsSync(REPLIED_FILE)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(REPLIED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveReplied(set) {
  // ISSUE-07: ensure data/ exists; ISSUE-08: atomic write via tmp + rename
  mkdirSync(join(__dirname, '../data'), { recursive: true });
  const tmp = REPLIED_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify([...set]));
  renameSync(tmp, REPLIED_FILE);
}

/**
 * Main engagement run — checks all recent posts for new comments and replies
 */
export async function runEngagementCycle() {
  logger.info('Starting engagement cycle...');

  const replied       = loadReplied();
  const posts         = await getOrgPosts(10);
  let   replied_count = 0;
  let   leads_found   = 0;

  for (const post of posts) {
    const postText = post.commentary || '';

    let comments;
    try {
      comments = await getComments(post.id);
    } catch (err) {
      logger.error(`Failed to get comments for post ${post.id}: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
      continue;
    }

    for (const comment of comments) {
      const commentUrn  = comment.commentUrn || comment.id;
      const commentId   = commentUrn;
      const commentText = comment.message?.text || '';
      const commenter   = comment.actor || '';

      if (replied.has(commentId)) continue;

      if (commentText.length < 5) {
        replied.add(commentId);
        continue;
      }

      logger.info(`Processing comment: "${commentText.slice(0, 60)}..."`);

      try {
        const classification = await classifyComment(commentText);
        logger.info(`Comment classified as: ${classification}`);

        if (classification === 'SPAM') {
          logger.info(`Skipping spam comment: ${commentId}`);
          replied.add(commentId);
          saveReplied(replied); // ISSUE-13: persist after each skip to survive crashes
          continue;
        }

        const reply = await generateReply(commentText, classification, postText);

        if (reply) {
          await replyToComment(post.id, commentUrn, reply);
          replied_count++;
          logger.info(`Replied to ${commenter}: "${reply.slice(0, 60)}..."`);
        }

        if (classification === 'LEAD_SIGNAL') {
          const leadInfo = await extractLeadInfo(commentText, commenter);
          logLead({
            name:              commenter,
            linkedinUrl:       `https://www.linkedin.com/feed/update/${post.id}/`,
            signal:            leadInfo.signal,
            serviceInterest:   leadInfo.service_interest,
            urgency:           leadInfo.urgency,
            sourcePostUrn:     post.id,
            commentText,
            suggestedFollowup: leadInfo.suggested_followup,
          });
          leads_found++;
          logger.info(`LEAD logged — urgency: ${leadInfo.urgency}`);
        }

        replied.add(commentId);
        saveReplied(replied); // ISSUE-13: persist after each reply to survive mid-cycle crashes

        await sleep(1500);

      } catch (err) {
        logger.error(`Error processing comment ${commentId}: ${err.message}`);
      }
    }
  }

  logger.info(`Engagement cycle complete — replied: ${replied_count}, leads found: ${leads_found}`);
  return { replied_count, leads_found };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
