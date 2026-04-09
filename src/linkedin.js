/**
 * LinkedIn API client — all API calls go through this module
 *
 * PHASE 1 (pre-MDP): author/actor = personUrn(), scope = w_member_social
 * PHASE 2 (post-MDP): change all personUrn() marked PHASE 1 back to orgUrn()
 *                     and uncomment PHASE 2 scopes in auth.js, then re-run npm run auth
 */

import axios from 'axios';
import { logger } from './logger.js';

const BASE             = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202602';

function headers() {
  return {
    Authorization:               `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
    'Content-Type':              'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version':          LINKEDIN_VERSION,
  };
}

const orgUrn    = () => `urn:li:organization:${process.env.LINKEDIN_ORGANIZATION_ID}`;
const personUrn = () => process.env.LINKEDIN_PERSON_URN;

// ─── POSTING ────────────────────────────────────────────────────────────────

export async function createPost(text) {
  const body = {
    author:      orgUrn(), // PHASE 1 — change to orgUrn() after MDP approved
    commentary:  text,
    visibility:  'PUBLIC',
    distribution: {
      feedDistribution:               'MAIN_FEED',
      targetEntities:                 [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState:            'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res    = await axios.post(`${BASE}/posts`, body, { headers: headers() });
  const postId = res.headers['x-restli-id'] || res.data?.id;
  if (!postId) logger.warn('createPost: could not extract post ID from response'); // ISSUE-15
  logger.info(`Post created: ${postId}`);
  return { id: postId, ...res.data };
}

export async function createImagePost(text, imageUrn) {
  const body = {
    author:      orgUrn(), // PHASE 1 — change to orgUrn() after MDP approved (ISSUE-01)
    commentary:  text,
    visibility:  'PUBLIC',
    distribution: {
      feedDistribution:               'MAIN_FEED',
      targetEntities:                 [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      media: { id: imageUrn },
    },
    lifecycleState:            'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res    = await axios.post(`${BASE}/posts`, body, { headers: headers() });
  const postId = res.headers['x-restli-id'] || res.data?.id;
  logger.info(`Image post created: ${postId}`);
  return { id: postId, ...res.data };
}

// ─── READING POSTS & COMMENTS ────────────────────────────────────────────────

export async function getOrgPosts(count = 20) {
  // ISSUE-04: Phase 1 must query by personUrn — org-level read requires r_organization_social
  const res = await axios.get(`${BASE}/posts`, {
    headers: headers(),
    params: {
      q:      'author',
      author: orgUrn(),
      count,
    },
  });
  return res.data.elements || [];
}

export async function getComments(postUrn, count = 50) {
  const encoded = encodeURIComponent(postUrn);
  const res = await axios.get(`${BASE}/socialActions/${encoded}/comments`, {
    headers: headers(),
    params: { count },
  });
  return res.data.elements || [];
}

export async function getAllRecentComments() {
  const posts   = await getOrgPosts(10);
  const results = [];
  for (const post of posts) {
    const comments = await getComments(post.id);
    for (const comment of comments) results.push({ post, comment });
  }
  return results;
}

// ─── REPLYING & COMMENTING ──────────────────────────────────────────────────

export async function replyToComment(postUrn, parentCommentUrn, text) {
  const encodedPost = encodeURIComponent(postUrn);
  const body = {
    actor:         orgUrn(), // PHASE 1 — change to orgUrn() after MDP approved (ISSUE-02)
    object:        postUrn,
    message:       { text },
    parentComment: parentCommentUrn,
  };

  const res = await axios.post(
    `${BASE}/socialActions/${encodedPost}/comments`,
    body,
    { headers: headers() }
  );
  logger.info(`Replied to comment ${parentCommentUrn}`);
  return res.data;
}

export async function commentOnPost(postUrn, text) {
  const encoded = encodeURIComponent(postUrn);
  const body = {
    actor:   orgUrn(), // PHASE 1 — change to orgUrn() after MDP approved (ISSUE-02)
    object:  postUrn,
    message: { text },
  };

  const res = await axios.post(
    `${BASE}/socialActions/${encoded}/comments`,
    body,
    { headers: headers() }
  );
  logger.info(`Commented on post ${postUrn}`);
  return res.data;
}

export async function likePost(postUrn) {
  // ISSUE-03: Phase 1 must use personUrn — org reactions require w_organization_social_feed
  const body = {
    root:         postUrn,
    reactionType: 'LIKE',
  };
  await axios.post(
    `${BASE}/reactions?actor=${encodeURIComponent(orgUrn())}`, // PHASE 1 — change to orgUrn() after MDP
    body,
    { headers: headers() }
  );
  logger.info(`Liked post ${postUrn}`);
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

// PHASE 1 NOTE: getFollowerStats() and getPageStats() require r_organization_social.
// Both will 403 until MDP is approved. Weekly report stats will be empty until then. (ISSUE-05)

export async function getFollowerStats() {
  const res = await axios.get(`${BASE}/networkSizes/${encodeURIComponent(orgUrn())}`, {
    headers: headers(),
    params: { edgeType: 'COMPANY_FOLLOWED_BY_MEMBER' },
  });
  return res.data;
}

export async function getPageStats() {
  const end   = Date.now();
  const start = end - 30 * 86400000;
  const res   = await axios.get(`${BASE}/organizationalEntityShareStatistics`, {
    headers: headers(),
    params: {
      q:                   'organizationalEntity',
      organizationalEntity: orgUrn(),
      'timeIntervals.timeGranularityType': 'DAY',
      'timeIntervals.timeRange.start':     start,
      'timeIntervals.timeRange.end':       end,
    },
  });
  return res.data.elements || [];
}

export async function getPostStats(postUrn) {
  const isShare = postUrn.startsWith('urn:li:share:');
  const params  = {
    q:                    'organizationalEntity',
    organizationalEntity: orgUrn(),
  };
  if (isShare) {
    params['shares[0]']   = postUrn;
  } else {
    params['ugcPosts[0]'] = postUrn;
  }

  const res     = await axios.get(`${BASE}/organizationalEntityShareStatistics`, {
    headers: headers(),
    params,
  });
  const element = res.data.elements?.[0];
  const stats   = element?.totalShareStatistics || {};
  return {
    numLikes:        stats.likeCount       || 0,
    numComments:     stats.commentCount    || 0,
    numShares:       stats.shareCount      || 0,
    impressionCount: stats.impressionCount || 0,
  };
}
