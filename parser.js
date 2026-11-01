'use strict';

// Client-side email text parsing for .eml, .mbox and pasted messages.
// The preview is built here, then the server confirms categories via
// /api/import/preview before anything is stored.

function extractAddress(raw) {
  const str = String(raw || '').trim();
  if (!str) return { name: '', email: '' };
  const m = str.match(/<([^>]+)>/);
  if (m) {
    const email = m[1].trim();
    const name = str.replace(/<[^>]+>/, '').replace(/["']/g, '').trim();
    return { name, email };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str)) return { name: '', email: str };
  return { name: str, email: '' };
}

const DAYS = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';

function parseOneBlock(block) {
  const lines = block.split(/\r?\n/);
  const headers = {};
  let body = '';
  let inHeaders = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inHeaders) {
      if (line.trim() === '') { inHeaders = false; continue; }
      if (/^[A-Za-z-]+:\s?/.test(line)) {
        const idx = line.indexOf(':');
        const key = line.slice(0, idx).toLowerCase();
        headers[key] = line.slice(idx + 1).trim();
      }
    } else {
      body += (body ? '\n' : '') + line;
    }
  }
  const from = extractAddress(headers.from);
  const subject = (headers.subject || '').trim();
  const dateRaw = (headers.date || '').trim();
  const at = parseEmailDate(dateRaw);
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 200);
  return { fromName: from.name, fromEmail: from.email.toLowerCase(), at, subject, snippet };
}

function parseEmailDate(raw) {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Returns an array of message objects.
function parseEmailText(text) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n');
  if (!cleaned.trim()) return [];

  // mbox format: messages separated by lines like "From a@b.com Sat Oct 31 ..."
  const re = new RegExp('(^|\\n)From \\S+@\\S+\\s+' + DAYS + '\\s', 'gm');
  let blocks = [];
  if (re.test(cleaned)) {
    re.lastIndex = 0;
    const matches = [...cleaned.matchAll(re)];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + (matches[i][1] ? 1 : 0);
      const end = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
      blocks.push(cleaned.slice(start, end));
    }
  } else {
    // Pasted text: several messages usually start with a "From:" header line.
    // Split before each such line (quoted reply bodies are prefixed with ">").
    const fromHeader = /(^|\n)(From\s*:|Return-Path:|Delivered-To:)/gm;
    const matches = [...cleaned.matchAll(fromHeader)];
    if (matches.length) {
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index + (matches[i][1] ? 1 : 0);
        const end = i + 1 < matches.length ? matches[i + 1].index + (matches[i + 1][1] ? 1 : 0) : cleaned.length;
        blocks.push(cleaned.slice(start, end));
      }
    } else {
      blocks = [cleaned];
    }
  }
  return blocks.map(parseOneBlock).filter(m => m.fromEmail);
}

window.NetworkRMParser = { parseEmailText, extractAddress };
