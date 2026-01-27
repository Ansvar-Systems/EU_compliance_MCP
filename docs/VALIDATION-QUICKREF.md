# Demand Validation Quick Reference

**For:** Repository maintainers
**Purpose:** Quick commands and decision tree for survey validation

---

## 🚀 Launch Survey (Day 0)

```bash
# 1. Tag and release v0.4.1
git tag v0.4.1
git push origin main --tags

# 2. Create discussion on GitHub
# Navigate to: Discussions → New discussion
# Select: "Delegated Acts & Technical Standards Support" template
# Pin the discussion

# 3. Update README (add survey banner)
# See: docs/SURVEY-LAUNCH-GUIDE.md for template

# 4. Announce
# - Twitter/X
# - LinkedIn
# - Reddit (r/cybersecurity, r/compliance)
# - Direct email to 5-10 known users
```

---

## 📊 Daily Monitoring (Days 1-14)

```bash
# Check response count
# Visit: https://github.com/[owner]/[repo]/discussions/[number]

# Update validation doc
# Edit: docs/demand-validation-2026-q1.md

# Analyze responses (when available)
npx tsx scripts/analyze-survey-responses.ts [discussion-number]
```

**Monitor:**
- Response count (target: 10+ minimum, 20+ ideal)
- Urgency levels (need 50%+ high for full implementation)
- Beta testers (need 3+ for confidence)
- Quality (detailed use cases vs. vague interest)

---

## 🎯 Decision Tree (Day 14)

### Path A: Proceed to v0.5.0 (Full Implementation)
**Criteria:**
- ✅ 20+ responses
- ✅ 50%+ high urgency (blocking/3mo)
- ✅ 3+ beta testers
- ✅ Specific CELEX IDs mentioned

**Action:**
```bash
# 1. Update roadmap
# Edit: README.md, CLAUDE.md

# 2. Create milestone
gh issue milestone create "v0.5.0 - Delegated Acts" --due 2026-03-15

# 3. Break down work
# Create issues for:
# - Database schema updates
# - Ingestion scripts (EBA, ESMA, etc.)
# - New tools (get_delegated_act, etc.)
# - Testing

# 4. Announce
# Post in discussion, Twitter, LinkedIn
```

**Timeline:** 3 weeks development

---

### Path B: Phased Approach (DORA Only)
**Criteria:**
- ✅ 10-20 responses
- ✅ 30%+ medium urgency (6mo)
- ✅ DORA dominates requests
- ✅ 1+ beta tester

**Action:**
```bash
# 1. Create v0.4.5 milestone
gh issue milestone create "v0.4.5 - DORA RTS/ITS" --due 2026-02-28

# 2. Scope to DORA only
# - EBA RTS on ICT risk management
# - EBA ITS on incident reporting
# - Testing frameworks

# 3. Plan expansion strategy
# - Monitor v0.4.5 usage
# - Decide on v0.5.0 scope based on adoption

# 4. Announce phased approach
```

**Timeline:** 1-2 weeks for DORA, then evaluate

---

### Path C: Defer (Focus Elsewhere)
**Criteria:**
- ❌ <10 responses
- ❌ Majority "nice to have"
- ❌ Vague use cases
- ❌ No beta testers

**Action:**
```bash
# 1. Document decision
# Update: docs/demand-validation-2026-q1.md

# 2. Explore alternatives
# Consider:
# - REST API layer (v0.6.0)
# - Performance optimizations
# - Additional search features
# - Better recital cross-referencing

# 3. Communicate decision
# - Discussion post (thank respondents)
# - Update roadmap
# - Set Q3 2026 review date

# 4. Close discussion
# Mark as answered, unpin
```

**Revisit:** Q3 2026 (6 months)

---

## 📝 Communication Templates

### High-Quality Response Follow-Up
```
Hi [Name],

Thanks for the detailed feedback on delegated acts support!

Quick follow-up: Would you be willing to do a 15-minute call to discuss your workflow in more detail? Specifically interested in:
- Which specific standards you reference most
- How much time this would save
- Any budget constraints

Calendar link: [link]

No pressure if you're busy - just trying to make sure we build the right thing!

Thanks,
[Your name]
```

### Mid-Survey Nudge (Day 7, if <10 responses)
```
📊 Survey Check-In: Still need your input!

We've received [X] responses so far on delegated acts support. Need 10+ to make an informed decision.

2-minute survey: [URL]

Especially valuable if you work on:
🏦 DORA compliance
🤖 AI Act implementation
⚡ NIS2 requirements

Closes Feb 10. Thanks!
```

### Beta Tester Recruitment (if proceeding)
```
Subject: EU Regulations MCP - Beta Testing Delegated Acts

Hi [Name],

You volunteered to beta test delegated acts support - thank you!

We're starting development next week. Beta program details:
- Private GitHub branch access
- Weekly builds
- 15-min feedback sessions (optional)
- Listed as contributor in release notes

Interested? Reply to confirm and I'll add you to the beta team.

Expected beta period: [dates]

Thanks for helping make this better!
```

---

## 🔧 Troubleshooting

### Low Response Rate (<5 in first 3 days)
**Actions:**
1. Check discussion visibility (is it pinned?)
2. Verify template renders correctly
3. Post in more communities (Hacker News, Reddit)
4. Email known users directly
5. Add urgency to messaging ("closes soon")

### Conflicting Signals
**Example:** 15 responses, but mixed urgency and vague use cases

**Actions:**
1. Conduct 3-5 user interviews
2. Ask clarifying questions in discussion
3. Request specific CELEX IDs
4. Lean toward phased approach (lower risk)

### All Responses from One Sector
**Example:** 20 responses, all financial services

**Actions:**
1. Still valid signal (clear market need)
2. Start with financial sector standards (DORA, MiCA)
3. Plan expansion for other sectors in v0.5.1
4. Announce sector-specific focus

---

## 📈 Success Metrics Summary

| Metric | Minimum | Ideal | Excellent |
|--------|---------|-------|-----------|
| Total Responses | 10 | 20 | 30+ |
| High Urgency % | 30% | 50% | 70%+ |
| Beta Testers | 1 | 3 | 5+ |
| Quality Score | 50/100 | 70/100 | 85/100 |
| User Interviews | 2 | 3 | 5+ |

**Quality Indicators:**
- ✅ Specific CELEX IDs mentioned
- ✅ Compliance deadlines cited
- ✅ Current tool frustrations detailed
- ✅ Willingness to help/sponsor

**Red Flags:**
- ❌ "Sounds cool" without details
- ❌ No specific regulations mentioned
- ❌ "Not urgent, but nice to have"
- ❌ No response to follow-up questions

---

## 🗓️ Timeline Reference

| Day | Milestone | Action |
|-----|-----------|--------|
| 0 | Launch | Create discussion, announce |
| 1-3 | Active outreach | Daily monitoring, respond to questions |
| 4-7 | Mid-point | Update validation doc, conduct interviews |
| 7 | Check-in | Mid-survey announcement if needed |
| 8-10 | Analysis | Preliminary decision framework |
| 11-13 | Final push | Reminder posts, last interviews |
| 14 | Decision | Finalize validation doc, announce decision |

---

## 📞 Emergency Contacts

**If you need help:**
- GitHub Discussions (for public questions)
- Repository issues (for technical problems)
- Email maintainers directly (for urgent/private matters)

**Resources:**
- Full launch guide: `docs/SURVEY-LAUNCH-GUIDE.md`
- Results tracking: `docs/demand-validation-2026-q1.md`
- Analysis script: `scripts/analyze-survey-responses.ts`

---

**Last updated:** 2026-01-27
**Next review:** After survey closes (2026-02-10)
