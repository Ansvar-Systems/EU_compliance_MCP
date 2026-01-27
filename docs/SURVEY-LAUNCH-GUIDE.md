# Delegated Acts Survey Launch Guide

**Target Launch Date:** After v0.4.1 release
**Survey Duration:** 2 weeks
**Goal:** 10+ quality responses to make informed decision

---

## Pre-Launch Checklist

### Repository Setup
- [x] Discussion template created (`.github/DISCUSSION_TEMPLATES/delegated-acts-interest.yml`)
- [x] Results document created (`docs/demand-validation-2026-q1.md`)
- [ ] Tag and release v0.4.1
- [ ] Verify discussion template renders correctly on GitHub

### Documentation Updates
- [ ] Add survey link to README.md "What's Included" section
- [ ] Add survey announcement to CLAUDE.md
- [ ] Update main branch with latest changes

---

## Launch Day (Day 0)

### 1. Create the Discussion

**Using GitHub UI:**
1. Go to repository → Discussions → New discussion
2. Select "Delegated Acts & Technical Standards Support" template
3. Verify all fields render correctly
4. Click "Start discussion"
5. Pin the discussion (right sidebar → Pin discussion)
6. Copy the discussion URL for announcements

**Expected URL format:**
```
https://github.com/[owner]/[repo]/discussions/[number]
```

### 2. Update README.md

Add after "What's Included" section (around line 150):

```markdown
## 🗳️ Shape the Roadmap

**We need your input!** Should we add delegated acts and technical standards (EBA RTS, ESMA ITS, harmonized standards)?

👉 **[Take the 2-minute survey](https://github.com/[owner]/[repo]/discussions/[number])**

Your feedback determines whether we add:
- DORA incident reporting RTS
- AI Act harmonized standards
- NIS2 implementing acts
- eIDAS 2.0 technical specifications
- And more...

Survey closes: **February 10, 2026**
```

### 3. Announcement Templates

#### Twitter/X Post
```
🚀 EU Regulations MCP v0.4.1 is live!

✅ Webhook notifications (Slack/Discord/Teams)
✅ HTTP server parity fix
✅ 37 regulations + 3,500 recitals

🗳️ Help shape v0.5.0: Should we add delegated acts (EBA RTS, AI Act standards)?

📊 Survey (2 min): [URL]

#EUCompliance #GDPR #DORA #NIS2 #AIAct
```

#### LinkedIn Post
```
Exciting update for the EU Regulations MCP server! 🎉

Version 0.4.1 brings:
✅ Real-time webhook notifications for EUR-Lex updates
✅ Full HTTP/stdio server parity (bug fix)
✅ Complete test coverage with 8 new integration tests

📊 We need YOUR input on the next major feature:

Should we add delegated acts and technical standards?
- EBA/EIOPA/ESMA RTS/ITS for financial services
- AI Act harmonized standards
- NIS2 implementing acts
- Medical device common specifications

If you're working on EU compliance (DORA, AI Act, NIS2, GDPR), your feedback is invaluable.

👉 2-minute survey: [URL]

This is an open-source project (MIT license) - we're building in public and prioritizing based on real user needs.

#Compliance #Cybersecurity #DORA #AIAct #NIS2 #GDPR #OpenSource
```

#### Reddit Posts

**r/cybersecurity**
```
Title: [Tool] EU Regulations MCP Server v0.4.1 - Query DORA, NIS2, GDPR from Claude

I've been building an open-source MCP server for EU cybersecurity regulations (DORA, NIS2, GDPR, AI Act, etc.). Just released v0.4.1 with webhook notifications.

The next major feature might be delegated acts (EBA technical standards, AI Act harmonized standards, etc.) - but only if there's demand.

If you work on EU compliance, I'd appreciate 2 minutes of feedback: [survey URL]

GitHub: [repo URL]
License: MIT
```

**r/compliance**
```
Title: Survey: Should we add EBA/ESMA technical standards to our EU regulations tool?

Context: I maintain an open-source MCP server that lets you query EU regulations (DORA, GDPR, NIS2, AI Act) directly from Claude/AI tools.

Considering adding delegated acts and technical standards (EBA RTS, ESMA ITS, harmonized standards) but want to validate demand first.

If you work on EU financial services compliance, this 2-minute survey would be super helpful: [URL]

Thanks!
```

---

## Day 1-3: Active Monitoring

### Daily Tasks
- [ ] Check discussion for new responses (morning & evening)
- [ ] Respond to questions/comments within 4 hours
- [ ] Reach out to high-quality respondents for clarification
- [ ] Update `docs/demand-validation-2026-q1.md` with response count

### Direct Outreach

**Target:** 5-10 known users or organizations working on EU compliance

**Email Template:**
```
Subject: Quick feedback on EU Regulations MCP roadmap?

Hi [Name],

I noticed you [used the tool / starred the repo / mentioned EU compliance work].

We're deciding whether to add delegated acts (EBA technical standards, AI Act harmonized standards, etc.) to the EU Regulations MCP server. Would you have 2 minutes to share your thoughts?

Survey: [URL]

No pressure if you're not interested - just trying to prioritize based on real needs rather than assumptions.

Thanks!
[Your name]
```

### Reddit Engagement
- Post in r/cybersecurity (Monday)
- Post in r/compliance (Wednesday)
- Post in r/Programming (Friday, if allowed)
- Respond to comments thoughtfully

---

## Day 4-7: Mid-Survey Check-In

### Analysis Tasks
- [ ] Compile response breakdown by urgency
- [ ] Identify top 3 most-requested regulations
- [ ] Extract compelling quotes
- [ ] Schedule 1-2 user interviews with high-urgency respondents

### User Interview Questions
1. Walk me through your current compliance workflow
2. What specific delegated acts do you reference most often?
3. How much time do you spend on EUR-Lex per week?
4. What would change if we added [specific standards]?
5. What's your budget for compliance tools?
6. Would you beta test this feature?

### Mid-Survey Announcement (if responses are low)

**Twitter/LinkedIn:**
```
📊 Survey Update: [X] responses so far on delegated acts support

Need your input! Takes 2 min: [URL]

Especially valuable if you work on:
🏦 Financial services (DORA)
🤖 AI systems (AI Act)
⚡ Critical infrastructure (NIS2)
🏥 Healthcare (MDR/IVDR)

Closes Feb 10. Let's build what people actually need!
```

---

## Day 8-14: Final Push

### Week 2 Tasks
- [ ] Send reminder to direct contacts who haven't responded
- [ ] Post update in relevant Slack/Discord communities
- [ ] Analyze trends and prepare preliminary decision
- [ ] Conduct remaining user interviews
- [ ] Update validation document with insights

### Day 10: Preliminary Analysis
- Review decision criteria
- Identify any gaps in data
- Prepare follow-up questions for ambiguous responses

### Day 12: Final Outreach
- Email reminder to engaged users
- Post "last call" announcement on social media

### Day 14: Close Survey & Make Decision
- [ ] Finalize `docs/demand-validation-2026-q1.md`
- [ ] Apply decision framework
- [ ] Document reasoning
- [ ] Update roadmap in README.md and CLAUDE.md
- [ ] Announce decision to community

---

## Decision Communication Templates

### If Proceeding to v0.5.0 (Full Implementation)

**GitHub Discussion Post:**
```
## Survey Results: We're Building Delegated Acts Support! 🎉

Thank you to everyone who participated! The response was clear:

📊 **Results:**
- [X] total responses
- [X]% high urgency (blocking/3mo)
- Top requests: [DORA, AI Act, NIS2...]
- [X] willing beta testers

🚀 **What's Next:**
- v0.5.0 development starts [date]
- Target release: [date]
- Beta program launching soon

Full results: docs/demand-validation-2026-q1.md

We'll keep you posted on progress. To all who volunteered to beta test - expect an email soon!
```

### If Doing Phased Approach (DORA Only)

**GitHub Discussion Post:**
```
## Survey Results: Starting with DORA Technical Standards

Thank you for the feedback! Based on responses:

📊 **Results:**
- [X] responses, moderate urgency
- DORA dominates requests
- Some interest in other regulations

🎯 **Phased Approach:**
- v0.4.5: DORA RTS/ITS only
- v0.5.0: Expand based on v0.4.5 usage
- Focus on quality over breadth

This lets us validate the approach before investing 3 weeks on all regulations.

Full results: docs/demand-validation-2026-q1.md
```

### If Deferring

**GitHub Discussion Post:**
```
## Survey Results: Deferring Delegated Acts

Thank you for participating! Based on responses:

📊 **Results:**
- [X] responses (below threshold)
- Mixed urgency levels
- Current scope meets most needs

🎯 **Decision:**
Deferring delegated acts to focus on:
- REST API layer (v0.6.0) [if validated elsewhere]
- Performance optimizations
- Additional quality-of-life features

We'll revisit this in Q3 2026. If your needs change, please open an issue!

Full results: docs/demand-validation-2026-q1.md
```

---

## Success Metrics

### Quantitative
- **Response volume:** 10+ (minimum), 20+ (ideal)
- **High urgency %:** 50%+ (strong signal)
- **Beta testers:** 3+ (validation)
- **Interview completion:** 2+ (depth)

### Qualitative
- Specific CELEX IDs mentioned (shows real need)
- Detailed use cases (not just "it would be nice")
- Clear compliance deadlines (urgency proof)
- Willingness to help/sponsor (skin in the game)

---

## Post-Survey Actions

### Update Documentation
- [ ] README.md - Remove survey banner, add decision
- [ ] CLAUDE.md - Update roadmap section
- [ ] docs/ROADMAP.md - Reflect new priorities (if file exists)

### Communicate Decision
- [ ] GitHub Discussion post (main announcement)
- [ ] Twitter thread summarizing results
- [ ] LinkedIn post with insights
- [ ] Email to all survey respondents

### If Proceeding with Development
- [ ] Create v0.5.0 milestone on GitHub
- [ ] Break down implementation into issues
- [ ] Set up beta testing program
- [ ] Create development branch

---

## Lessons Learned (Post-Mortem)

**To be filled after survey closes:**

### What Worked Well
- (To be documented)

### What Could Be Improved
- (To be documented)

### Unexpected Insights
- (To be documented)

### Recommendations for Future Surveys
- (To be documented)

---

**Maintained by:** Repository maintainers
**Questions?** Open an issue or discussion
