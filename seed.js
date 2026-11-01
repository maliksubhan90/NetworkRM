'use strict';

// A believable sample mailbox so the app demos instantly. The user can wipe
// it in Settings and import their own emails instead.

function daysAgo(n, hour = 10) {
  const d = new Date(Date.now() - n * 86400000 - hour * 3600000);
  return d.toISOString();
}

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0];
  return local.split(/[._-]+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function msg(days, subject, snippet, from, to = 'alex@meridian.co') {
  return { at: daysAgo(days), from, to, subject, snippet, fromName: nameFromEmail(from) };
}

function sampleMessages() {
  const alice = 'alex@meridian.co';
  return [
    // Clients
    msg(2,  'Campaign kickoff notes', 'Hi Alex, here are the notes from our kickoff. First deliverables land Thursday.', 'claire.donovan@northwindmedia.com', alice),
    msg(9,  'Invoice #1042 - Q3 media', 'Attached is the invoice for the Q3 media plan.', 'claire.donovan@northwindmedia.com', alice),
    msg(21, 'Feedback on the creative brief', 'The team reviewed the brief. Two sections need another pass.', 'claire.donovan@northwindmedia.com', alice),
    msg(3,  'Revised proposal for the brand refresh', 'Updated the proposal based on our call. Timeline is tighter now.', 'tomas.rivera@atelierstudios.co', alice),
    msg(16, 'Contract draft attached', 'Please take a look at the contract draft when you can.', 'tomas.rivera@atelierstudios.co', alice),
    msg(40, 'Nice to catch up at the studio', 'Good to see you. Let us pick this up next week.', 'tomas.rivera@atelierstudios.co', alice),
    msg(5,  'Approval on the campaign plan', 'Approved. We can start booking media next Monday.', 'priya.sharma@luminahealth.io', alice),
    msg(30, 'Retainer renewal discussion', 'Can we block an hour to talk about next quarter?', 'priya.sharma@luminahealth.io', alice),
    msg(64, 'Introducing the new VP Marketing', 'Excited to work together this year.', 'priya.sharma@luminahealth.io', alice),
    msg(7,  'Project status and next milestones', 'Status is green. Milestones attached.', 'jonas.weber@craftline.eu', alice),
    msg(33, 'Kickoff meeting invite', 'Calendar invite sent for the kickoff.', 'jonas.weber@craftline.eu', alice),
    // Internal team
    msg(1,  'Standup notes for today', 'Blockers: none. Shipping the onboarding flow today.', 'emma.collins@meridian.co', alice),
    msg(6,  'Sprint planning doc', 'Here is the draft sprint plan for review.', 'emma.collins@meridian.co', alice),
    msg(12, '1:1 this week?', 'Free Thursday afternoon if you want to sync.', 'emma.collins@meridian.co', alice),
    msg(4,  'All-hands agenda for Friday', 'Agenda attached. Two guests this month.', 'david.park@meridian.co', alice),
    msg(26, 'Internal onboarding checklist', 'Updated the checklist with the new tools.', 'david.park@meridian.co', alice),
    // Investors
    msg(8,  'Q3 board update request', 'Could you send the board update by Thursday?', 'marcus.lee@brightlinecapital.com', alice),
    msg(23, 'Term sheet review notes', 'Notes on the term sheet attached, happy to walk through.', 'marcus.lee@brightlinecapital.com', alice),
    msg(55, 'Pitch deck v3 feedback', 'Strong progress. The market slide needs more proof.', 'marcus.lee@brightlinecapital.com', alice),
    msg(11, 'Monthly investor update', 'Thanks for the update. Numbers look healthy.', 'sofia.almeida@northpeak.vc', alice),
    msg(47, 'Intro call recap', 'Recap from our intro call, good energy.', 'sofia.almeida@northpeak.vc', alice),
    // Partners
    msg(2,  'Partnership proposal attached', 'Excited about the co-sell motion.', 'grace.okafor@arcadialabs.com', alice),
    msg(15, 'Co-marketing ideas for Q4', 'A few joint ideas for Q4.', 'grace.okafor@arcadialabs.com', alice),
    msg(38, 'Integration kickoff', 'Docs and access are ready on our side.', 'grace.okafor@arcadialabs.com', alice),
    msg(6,  'Joint roadmap discussion', 'Can we align roadmaps before the holidays?', 'daniel.kim@switchgear.io', alice),
    msg(19, 'Reseller agreement draft', 'Draft for review, mostly standard terms.', 'daniel.kim@switchgear.io', alice),
    // Vendors
    msg(10, 'Monthly invoice from CloudHost', 'Invoice for October hosting is attached.', 'elena.petrova@cloudhost.pro', alice),
    msg(44, 'Renewal notice for the hosting plan', 'Your plan renews at the end of the month.', 'elena.petrova@cloudhost.pro', alice),
    msg(70, 'New pricing quote', 'Quote for the expanded plan as discussed.', 'elena.petrova@cloudhost.pro', alice),
    msg(13, 'Support ticket #4821 resolved', 'Your ticket was resolved. Let us know if it recurs.', 'sam.whitfield@invoiceflow.app', alice),
    msg(52, 'API credentials for the new workspace', 'New credentials are ready in the dashboard.', 'sam.whitfield@invoiceflow.app', alice),
    // Other
    msg(14, 'Alumni dinner next month?', 'A few of us are meeting downtown. In?', 'amelia.hart@harvardalumni.org', alice),
    msg(80, 'Coffee when you are back in town', 'Whenever suits, happy to catch up.', 'amelia.hart@harvardalumni.org', alice),
    msg(25, 'Follow up from the conference', 'Great meeting you at the summit.', 'rahul.nair@conference.biz', alice),
    msg(95, 'Great talk at the summit', 'Loved your talk, sharing notes here.', 'rahul.nair@conference.biz', alice),
    msg(78, 'Coffee sometime?', 'No rush. Whenever you are near the studio.', 'lena.fischer@municipal.studio', alice),
    msg(92, 'Speaking gig in spring?', 'Would you be open to a talk at the summit?', 'yuki.tanaka@devrel.systems', alice)
  ];
}

// Group raw messages into contact-shaped import items.
function messagesToItems(messages) {
  const byEmail = new Map();
  for (const m of messages || []) {
    // Accept both the raw seed shape ({ from: 'a@b.co' }) and the client
    // parser shape ({ fromEmail, fromName }).
    const from = String(m.fromEmail || m.from || '').toLowerCase();
    if (!from.includes('@')) continue;
    if (!byEmail.has(from)) byEmail.set(from, { name: m.fromName || '', email: from, emails: [] });
    byEmail.get(from).emails.push(m);
  }
  const items = [...byEmail.values()];
  for (const it of items) it.sample = 1;
  return items;
}

module.exports = { sampleMessages, messagesToItems };
