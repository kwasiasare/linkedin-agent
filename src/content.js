/**
 * Content generation module — uses Claude to create LinkedIn posts and replies
 * All content is grounded in Spreadcom LLC brand context
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../data');
const STATE_FILE = join(DATA_DIR, 'content_state.json');

// fix #25: lazy client — initialised on first use, after dotenv has loaded
let _client;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

// Appended to every post — guaranteed regardless of what Claude generates.
const CONTACT_FOOTER = '\n\n📞 +1 774 570 0034 | 🌐 spreadcomgh.com | 📧 info@spreadcomgh.com';

/**
 * Enforce LinkedIn's 1,300 character post limit on the body text.
 * The caller must pass (1300 - CONTACT_FOOTER.length) as the limit
 * so the final post including the footer stays within 1,300 chars.
 * Truncates at the last sentence boundary to keep the post readable.
 */
function enforceCharLimit(text, limit) {
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit);
  const lastEnd   = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('!\n'),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('?\n'),
  );
  return lastEnd > limit * 0.7 ? text.slice(0, lastEnd + 1).trimEnd() : truncated.trimEnd();
}

// ─── STATE PERSISTENCE ───────────────────────────────────────────────────────
// pillarIndex and recentSubTopics are persisted to disk so they survive
// process restarts. Without this, pillarIndex resets to 0 every restart
// and the agent posts the same pillar (security_awareness) every day.

function loadState() {
  if (!existsSync(STATE_FILE)) return { pillarIndex: 0, recentSubTopics: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { pillarIndex: 0, recentSubTopics: [] };
  }
}

function saveState(state) {
  mkdirSync(DATA_DIR, { recursive: true }); // L-012: guard before write
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── BRAND CONTEXT ───────────────────────────────────────────────────────────

const BRAND_CONTEXT = `
You are writing LinkedIn content for Spreadcom LLC, a Microsoft 365 Managed Services Provider.

COMPANY FACTS:
- Name: Spreadcom LLC
- Location: Worcester, MA — serving all US businesses
- Specialization: Microsoft 365 managed services exclusively for SMEs (10–250 employees)
- Pricing: Starting at $20/user/month
- Core services: Microsoft Entra ID, Intune, Windows Autopilot, Conditional Access, Zero Trust, Microsoft Defender, Azure management, Cloud Migration (Exchange, SharePoint, hybrid identity)
- CTA: Free consultation / free environment assessment at spreadcomgh.com

TARGET AUDIENCE:
- CEO/Founders and COOs at SMEs (10–250 employees)
- IT Managers without dedicated M365 expertise
- Industries: Professional Services, Healthcare, Legal, Finance, Real Estate, Nonprofits, Education

BRAND VOICE:
- Authoritative but accessible — expert, not salesy
- Problem-aware — lead with the SME pain point before the solution
- Specific — use product names (Entra ID, Intune, Defender, Autopilot), numbers, outcomes
- Professional LinkedIn tone — no hype, no slang

RULES:
- Maximum 1,300 characters per post
- End with 3–5 relevant hashtags from: #Microsoft365 #ManagedServices #CyberSecurity #SMB #CloudSecurity #MicrosoftIntune #EntraID #ZeroTrust #ITManagement #AzureCloud #SmallBusiness #DigitalTransformation #WorkplaceTech #MicrosoftDefender #CloudMigration #Autopilot #ConditionalAccess
- Use 1–3 emojis maximum
- Always tie technical content to a business outcome
`;

// ─── CONTENT PILLARS ─────────────────────────────────────────────────────────

const PILLARS = [
  'security_awareness',
  'product_education',
  'cost_vs_value',
  'migration',
  'compliance_risk',
  'sme_productivity',
  'engagement_poll',
  'thought_leadership',
];

// Sub-topics provide a specific angle within each pillar.
// The agent rotates through these to ensure no two posts cover the same ground.
const PILLAR_SUB_TOPICS = {
  security_awareness: [
    'phishing campaigns targeting Microsoft 365 credentials',
    'why default MFA settings leave SMEs exposed',
    'legacy authentication protocols as an open door for attackers',
    'what happens when Conditional Access is misconfigured',
    'business email compromise (BEC) and how it starts in M365',
    'password spray attacks targeting Microsoft accounts',
    'the risk of over-privileged admin accounts in small businesses',
    'why 43% of cyberattacks target small businesses',
  ],
  product_education: [
    'Microsoft Intune for unified device management',
    'Entra ID (Azure AD) and modern identity protection',
    'Windows Autopilot for zero-touch device deployment',
    'Microsoft Defender for Business — what it actually blocks',
    'Conditional Access: the firewall for your identity layer',
    'Privileged Identity Management (PIM) for least-privilege access',
    'Microsoft Purview for data loss prevention',
    'Microsoft Secure Score — your M365 security health check',
  ],
  cost_vs_value: [
    'the true cost of a full-time IT admin vs $20/user/month',
    'what one unmanaged M365 breach costs vs a year of managed services',
    'the hidden cost of DIY Microsoft 365 administration',
    'downtime cost: what happens when M365 is misconfigured',
    'comparing in-house IT overhead to outsourced M365 management',
    'ROI of proper Conditional Access — quantified',
    'what SMEs overpay for by not bundling M365 with management',
  ],
  migration: [
    'moving from on-premises Exchange to Exchange Online',
    'migrating on-prem SharePoint to SharePoint Online',
    'Windows Server Active Directory to Entra ID migration',
    'hybrid identity: when on-prem AD and Entra ID co-exist',
    'legacy file server to SharePoint and OneDrive migration',
    'the risk of running Exchange Server past end-of-support',
    'what a phased M365 migration looks like for a 50-person firm',
  ],
  compliance_risk: [
    'HIPAA compliance requirements for M365 in healthcare SMEs',
    'CMMC 2.0 requirements and Microsoft 365 GCC',
    'NIST CSF and how M365 Zero Trust maps to it',
    'data retention policies in Microsoft Purview',
    'audit log requirements for financial services firms on M365',
    'what a data breach under GDPR/CCPA costs a small business',
    'SOC 2 readiness and Microsoft 365 security controls',
  ],
  sme_productivity: [
    'how Autopilot reduces new-hire device setup from hours to minutes',
    'Teams governance — why ungoverned Teams channels become a liability',
    'Intune app deployment: pushing software to 50 devices in one click',
    'SharePoint permissions: why most SMEs have them dangerously wrong',
    'Microsoft 365 Copilot — what it means for SME productivity',
    'OneDrive vs SharePoint: which one your team should actually be using',
    'Power Automate: the M365 feature SMEs consistently ignore',
  ],
  engagement_poll: [
    'biggest IT security concern for SMEs in 2026',
    'most underused Microsoft 365 feature in your organization',
    'biggest barrier to adopting Zero Trust security',
    'what SMEs struggle most with in Microsoft 365 management',
    'remote work and Microsoft 365 — biggest challenge poll',
    'when did you last review your Microsoft 365 security settings',
  ],
  thought_leadership: [
    'why Microsoft Copilot is changing what SMEs need from their IT partner',
    'the death of the on-premises IT room — and what replaces it',
    'Zero Trust is not a product — it is a posture',
    'why SMEs are the most targeted and least protected segment in cybersecurity',
    'the shift from reactive IT support to proactive managed services',
    'what the Microsoft 365 roadmap means for small business IT in 2026',
    'identity is the new perimeter — and most SMEs have no fence',
  ],
};

const PILLAR_PROMPTS = {
  security_awareness: `Write a LinkedIn post about cybersecurity threats targeting SMEs running Microsoft 365.
    Include a compelling statistic or fact. Focus on the specific angle provided below.
    End with a soft CTA to book a free assessment.`,

  product_education: `Write a LinkedIn post that educates SME decision-makers about the specific Microsoft 365
    product or feature in the angle below. Explain what it does in plain language, why SMEs need it,
    and what they're missing without it. End with a CTA.`,

  cost_vs_value: `Write a LinkedIn post framed around the specific cost/value angle below.
    Be specific about numbers and what is included. Frame it as a financial decision, not a tech decision.
    End with a CTA.`,

  migration: `Write a LinkedIn post targeting businesses facing the specific migration scenario below.
    Address the risk and cost of staying in the current state. Explain how Spreadcom LLC handles
    the full migration to Microsoft 365. End with a CTA.`,

  compliance_risk: `Write a LinkedIn post about compliance and data governance for SMEs using Microsoft 365.
    Focus on the specific compliance angle below. Explain how proper M365 configuration
    (Zero Trust, Conditional Access, Defender) helps achieve compliance. End with a CTA.`,

  sme_productivity: `Write a LinkedIn post about the specific Microsoft 365 productivity angle below.
    Show what SMEs are leaving unused and what it costs them. Keep it practical and relatable.
    End with a CTA.`,

  engagement_poll: `Write a LinkedIn poll post on the topic below. Ask a question relevant to IT managers
    and SME owners. Provide 4 answer options. Add 2-3 sentences of context before the poll.
    Format as:
    [intro text]
    A) [option]
    B) [option]
    C) [option]
    D) [option]
    [1 closing line]
    [hashtags]`,

  thought_leadership: `Write a short thought-leadership LinkedIn post (under 800 characters) on the
    specific insight below. Position Spreadcom LLC as forward-thinking.
    No hard CTA — just brand authority.`,
};

// ─── POST GENERATION ─────────────────────────────────────────────────────────

/**
 * Generate a daily LinkedIn post
 */
export async function generateDailyPost(overridePillar = null) {
  const state  = loadState();
  const pillar = overridePillar || PILLARS[state.pillarIndex % PILLARS.length];

  if (!overridePillar) {
    state.pillarIndex++;
  }

  // Select a sub-topic not used in the last 14 posts.
  // On exhaustion, re-filter to avoid immediately re-selecting a recent topic.
  const subTopics = PILLAR_SUB_TOPICS[pillar] || [];
  const recentSet = new Set((state.recentSubTopics || []).filter(x => x));
  const available = subTopics.filter(t => !recentSet.has(t));
  // Fallback: if all exhausted, use any sub-topic not in the most recent 4 (guaranteed variety)
  const pool      = available.length > 0
    ? available
    : subTopics.filter(t => !(new Set((state.recentSubTopics || []).slice(-4))).has(t)) || subTopics;
  const subTopic  = pool[Math.floor(Math.random() * pool.length)];

  // Build updated recent list BEFORE the API call so we can pass it to Claude.
  // We save state only AFTER a successful API call to avoid consuming a sub-topic slot
  // on a failed generation (network error, rate limit, etc.).
  const updatedRecent = [...(state.recentSubTopics || []), subTopic].slice(-14);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  // Exclude the current subTopic from the "recently covered" list shown to Claude
  // (it's the last item in updatedRecent, so slice(0, -1) removes it).
  const recentList = updatedRecent.slice(0, -1).join('; ') || 'none yet';

  logger.info(`Generating post — pillar: ${pillar}, angle: ${subTopic}`);

  const message = await getClient().messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 600,
    messages: [{
      role:    'user',
      content: `${BRAND_CONTEXT}

TODAY'S DATE: ${today}
SPECIFIC ANGLE FOR THIS POST: ${subTopic}
RECENTLY COVERED TOPICS (do not repeat these): ${recentList}

TASK:
${PILLAR_PROMPTS[pillar]}

Write a post specifically focused on: ${subTopic}
Write only the post text — no explanations, no labels, no quotation marks.
This post must be distinctly different from the recently covered topics listed above.`,
    }],
  });

  // Save state only after a successful API call — prevents consuming a pillar slot on failure
  state.recentSubTopics = updatedRecent;
  saveState(state);

  const raw        = message.content[0].text.trim();
  const bodyLimit  = 1300 - CONTACT_FOOTER.length;
  const body       = enforceCharLimit(raw, bodyLimit);
  if (body.length < raw.length) {
    logger.warn(`Post body truncated from ${raw.length} to ${body.length} chars to fit footer`);
  }
  const text = body + CONTACT_FOOTER;
  logger.info(`Post generated (${text.length} chars) — pillar: ${pillar}, angle: ${subTopic}`);
  return { text, pillar, subTopic };
}

// ─── COMMENT CLASSIFICATION ───────────────────────────────────────────────────

/**
 * Classify a comment to determine how to respond
 */
export async function classifyComment(commentText) {
  const message = await getClient().messages.create({
    model:      'claude-haiku-3-5-20241022',
    max_tokens: 100,
    messages: [{
      role:    'user',
      content: `Classify this LinkedIn comment for a Microsoft 365 MSP company page.

Comment: "${commentText}"

Classify as exactly one of:
- LEAD_SIGNAL (expressed interest in services, asked about pricing, asked about a specific service)
- TECHNICAL_QUESTION (asked a technical question about M365, IT, or security)
- POSITIVE (compliment, thank you, good feedback)
- NEGATIVE (complaint, criticism)
- SPAM (irrelevant, promotional, bot-like)
- GENERAL (neutral, general comment, opinion)

Reply with only the classification word.`,
    }],
  });

  // L-014: validate output against known classes to prevent logic errors on unexpected model output
  const VALID = ['LEAD_SIGNAL', 'TECHNICAL_QUESTION', 'POSITIVE', 'NEGATIVE', 'SPAM', 'GENERAL'];
  const raw   = message.content[0].text.trim().toUpperCase();
  return VALID.includes(raw) ? raw : 'GENERAL';
}

// ─── REPLY GENERATION ────────────────────────────────────────────────────────

/**
 * Generate a contextual reply to a comment
 */
export async function generateReply(commentText, classification, postText = '') {
  const replyGuidance = {
    LEAD_SIGNAL: `The commenter has shown buying intent. Reply warmly, provide one helpful insight,
      and invite them to book a free consultation at spreadcomgh.com. Keep it personal, not pushy.`,

    TECHNICAL_QUESTION: `Answer the question accurately and briefly (2–3 sentences max).
      Tie the answer back to how Spreadcom LLC handles this for SMEs.
      Optionally offer to go deeper via a free consultation.`,

    POSITIVE: `Acknowledge their kind words warmly. Reinforce one Spreadcom brand differentiator
      (specialization in M365, SME focus, or pricing). Invite further conversation.`,

    NEGATIVE: `Acknowledge their concern empathetically. Do not be defensive.
      Offer to resolve privately: "We'd love to make this right — feel free to DM us directly."`,

    GENERAL: `Engage thoughtfully with their comment. Add value with one insight related to
      Microsoft 365 or IT management for SMEs. Keep it brief and conversational.`,

    SPAM: `Return null — do not reply to spam.`,
  };

  if (classification === 'SPAM') return null;

  const guidance = replyGuidance[classification] || replyGuidance.GENERAL;

  const message = await getClient().messages.create({
    model:      'claude-haiku-3-5-20241022',
    max_tokens: 200,
    messages: [{
      role:    'user',
      content: `${BRAND_CONTEXT}

You are replying to a comment on Spreadcom LLC's LinkedIn post.

Original post context: "${postText?.slice(0, 200) || 'Spreadcom LLC Microsoft 365 content'}"
Comment received: "${commentText}"
Comment type: ${classification}

Reply guidance: ${guidance}

Write only the reply text — natural, conversational LinkedIn tone. Under 300 characters. No hashtags in replies.`,
    }],
  });

  return message.content[0].text.trim();
}

// ─── LEAD ANALYSIS ───────────────────────────────────────────────────────────

/**
 * Extract lead information from a comment
 */
export async function extractLeadInfo(commentText, commenterName, commenterCompany = '') {
  const message = await getClient().messages.create({
    model:      'claude-haiku-3-5-20241022',
    max_tokens: 200,
    messages: [{
      role:    'user',
      content: `Extract lead information from this LinkedIn comment for a Microsoft 365 MSP.

Commenter: ${commenterName}
Company: ${commenterCompany}
Comment: "${commentText}"

Return a JSON object with:
{
  "signal": "one sentence describing the buying intent",
  "service_interest": "which service they seem interested in or null",
  "urgency": "high / medium / low",
  "suggested_followup": "one sentence on how to follow up"
}

Return only the JSON, no other text.`,
    }],
  });

  try {
    return JSON.parse(message.content[0].text.trim());
  } catch {
    return { signal: commentText.slice(0, 100), urgency: 'medium', suggested_followup: 'Follow up with free consultation offer.' };
  }
}

// ─── WEEKLY REPORT GENERATION ─────────────────────────────────────────────────

/**
 * Generate a weekly performance summary
 */
export async function generateWeeklyReport(stats) {
  const message = await getClient().messages.create({
    model:      'claude-haiku-3-5-20241022',
    max_tokens: 500,
    messages: [{
      role:    'user',
      content: `Generate a concise business development weekly report for Spreadcom LLC LinkedIn page.

Stats this week:
${JSON.stringify(stats, null, 2)}

Format as a readable markdown report with:
- Executive summary (2 sentences)
- Key metrics
- Top performing content
- Lead pipeline summary
- 3 recommended actions for next week

Keep it under 400 words. Professional tone.`,
    }],
  });

  return message.content[0].text.trim();
}
