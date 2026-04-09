/**
 * Lead tracking module — logs and manages all lead signals from LinkedIn
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = join(__dirname, '../data/leads.json');

function loadLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  // ISSUE-07: ensure data/ exists; ISSUE-08: atomic write via tmp + rename
  mkdirSync(join(__dirname, '../data'), { recursive: true });
  const tmp = LEADS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(leads, null, 2));
  renameSync(tmp, LEADS_FILE);
}

/**
 * Log a new lead from a LinkedIn comment or DM
 */
export function logLead({
  name,
  company = '',
  linkedinUrl = '',
  signal,
  serviceInterest = null,
  urgency = 'medium',
  sourcePostUrn = '',
  commentText = '',
  suggestedFollowup = '',
}) {
  const leads = loadLeads();

  // Check for duplicate (same person + signal within 7 days)
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  // fix #20: company is always empty (unavailable from Comments API); deduplicate by name (URN) only
  const isDuplicate = leads.some(
    l => l.name === name && new Date(l.createdAt).getTime() > sevenDaysAgo
  );

  if (isDuplicate) {
    logger.info(`Duplicate lead skipped: ${name} @ ${company}`);
    return null;
  }

  const lead = {
    id:               `lead_${Date.now()}`,
    name,
    company,
    linkedinUrl,
    signal,
    serviceInterest,
    urgency,
    sourcePostUrn,
    commentText:      commentText.slice(0, 300),
    suggestedFollowup,
    status:           'new',       // new | contacted | qualified | booked | closed
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
    notes:            [],
  };

  leads.push(lead);
  saveLeads(leads);

  logger.info(`Lead logged: ${name} @ ${company} — urgency: ${urgency}`);
  return lead;
}

/**
 * Update lead status
 */
export function updateLeadStatus(leadId, status, note = '') {
  const leads = loadLeads();
  const lead  = leads.find(l => l.id === leadId);

  if (!lead) return false;

  lead.status    = status;
  lead.updatedAt = new Date().toISOString();
  if (note) lead.notes.push({ note, at: new Date().toISOString() });

  saveLeads(leads);
  logger.info(`Lead ${leadId} updated to: ${status}`);
  return true;
}

/**
 * Get all leads, optionally filtered by status
 */
export function getLeads(status = null) {
  const leads = loadLeads();
  return status ? leads.filter(l => l.status === status) : leads;
}

/**
 * Get lead pipeline summary for weekly report
 */
export function getLeadSummary() {
  const leads = loadLeads();
  const now   = Date.now();
  const week  = 7 * 86400000;

  const thisWeek = leads.filter(l => new Date(l.createdAt).getTime() > now - week);

  return {
    total_all_time:  leads.length,
    new_this_week:   thisWeek.length,
    by_status: {
      new:       leads.filter(l => l.status === 'new').length,
      contacted: leads.filter(l => l.status === 'contacted').length,
      qualified: leads.filter(l => l.status === 'qualified').length,
      booked:    leads.filter(l => l.status === 'booked').length,
      closed:    leads.filter(l => l.status === 'closed').length,
    },
    by_urgency: {
      high:   thisWeek.filter(l => l.urgency === 'high').length,
      medium: thisWeek.filter(l => l.urgency === 'medium').length,
      low:    thisWeek.filter(l => l.urgency === 'low').length,
    },
    high_priority: leads.filter(l => l.urgency === 'high' && l.status === 'new'),
  };
}
