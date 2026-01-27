#!/usr/bin/env tsx

/**
 * Survey Response Analysis Helper
 *
 * Helps analyze delegated acts survey responses from GitHub Discussions.
 * Can be run manually or integrated into workflow.
 *
 * Usage:
 *   npx tsx scripts/analyze-survey-responses.ts [discussion-number]
 *
 * Requires:
 *   GITHUB_TOKEN environment variable (for API access)
 */

interface SurveyResponse {
  id: string;
  author: string;
  createdAt: string;
  urgency: string;
  regulations: string[];
  useCase: string;
  specificStandards: string;
  currentWorkaround: string;
  willingToHelp: string[];
  additionalContext: string;
}

interface AnalysisResults {
  totalResponses: number;
  urgencyBreakdown: Record<string, number>;
  topRegulations: Record<string, number>;
  betaTesters: number;
  potentialSponsors: number;
  qualityScore: number;
  recommendation: 'proceed' | 'phased' | 'defer';
  reasoning: string[];
}

const URGENCY_LEVELS = {
  blocking: '🔴 Blocking current work',
  threeMonth: '🟡 Needed within 3 months',
  sixMonth: '🟢 Needed within 6 months',
  niceToHave: '🔵 Nice to have eventually',
  notNeeded: '⚪ Not needed',
};

const DECISION_THRESHOLDS = {
  proceed: {
    minResponses: 20,
    minHighUrgency: 0.5,
    minBetaTesters: 3,
  },
  phased: {
    minResponses: 10,
    minMediumUrgency: 0.3,
    minBetaTesters: 1,
  },
};

/**
 * Parse a survey response from GitHub Discussion comment body
 */
function parseResponse(commentBody: string, author: string, createdAt: string): SurveyResponse | null {
  try {
    // This is a simplified parser - actual implementation would parse the structured form data
    // from GitHub Discussion form responses

    const urgencyMatch = commentBody.match(/urgency[:\s]+(.+)/i);
    const regulationsMatch = commentBody.match(/regulations[:\s]+(.+)/i);
    const useCaseMatch = commentBody.match(/use case[:\s]+(.+)/i);

    return {
      id: `response-${Date.now()}`,
      author,
      createdAt,
      urgency: urgencyMatch?.[1] || 'unknown',
      regulations: regulationsMatch?.[1]?.split(',').map(r => r.trim()) || [],
      useCase: useCaseMatch?.[1] || '',
      specificStandards: '',
      currentWorkaround: '',
      willingToHelp: [],
      additionalContext: '',
    };
  } catch (error) {
    console.error('Failed to parse response:', error);
    return null;
  }
}

/**
 * Analyze collected survey responses
 */
function analyzeResponses(responses: SurveyResponse[]): AnalysisResults {
  const urgencyBreakdown: Record<string, number> = {};
  const topRegulations: Record<string, number> = {};
  let betaTesters = 0;
  let potentialSponsors = 0;
  let qualityScore = 0;

  for (const response of responses) {
    // Count urgency levels
    urgencyBreakdown[response.urgency] = (urgencyBreakdown[response.urgency] || 0) + 1;

    // Count regulation requests
    for (const reg of response.regulations) {
      topRegulations[reg] = (topRegulations[reg] || 0) + 1;
    }

    // Count beta testers
    if (response.willingToHelp.includes('beta test')) {
      betaTesters++;
    }

    // Count potential sponsors
    if (response.willingToHelp.includes('sponsoring')) {
      potentialSponsors++;
    }

    // Calculate quality score (0-100)
    let responseQuality = 0;
    if (response.useCase.length > 100) responseQuality += 30;
    if (response.specificStandards.length > 0) responseQuality += 30;
    if (response.regulations.length > 0) responseQuality += 20;
    if (response.additionalContext.length > 50) responseQuality += 20;
    qualityScore += responseQuality;
  }

  qualityScore = responses.length > 0 ? qualityScore / responses.length : 0;

  // Determine recommendation
  const highUrgency = (urgencyBreakdown['🔴 Blocking current work'] || 0) +
                      (urgencyBreakdown['🟡 Needed within 3 months'] || 0);
  const highUrgencyPercent = responses.length > 0 ? highUrgency / responses.length : 0;

  let recommendation: 'proceed' | 'phased' | 'defer' = 'defer';
  const reasoning: string[] = [];

  if (responses.length >= DECISION_THRESHOLDS.proceed.minResponses &&
      highUrgencyPercent >= DECISION_THRESHOLDS.proceed.minHighUrgency &&
      betaTesters >= DECISION_THRESHOLDS.proceed.minBetaTesters) {
    recommendation = 'proceed';
    reasoning.push(`Strong signal: ${responses.length} responses, ${Math.round(highUrgencyPercent * 100)}% high urgency`);
    reasoning.push(`${betaTesters} beta testers willing to help validate`);
    reasoning.push(`Quality score: ${Math.round(qualityScore)}/100`);
  } else if (responses.length >= DECISION_THRESHOLDS.phased.minResponses &&
             betaTesters >= DECISION_THRESHOLDS.phased.minBetaTesters) {
    recommendation = 'phased';
    reasoning.push(`Moderate signal: ${responses.length} responses`);
    reasoning.push('Consider phased approach starting with top-requested regulation');

    const topReg = Object.entries(topRegulations).sort((a, b) => b[1] - a[1])[0];
    if (topReg) {
      reasoning.push(`Start with ${topReg[0]} (${topReg[1]} requests)`);
    }
  } else {
    recommendation = 'defer';
    reasoning.push(`Insufficient signal: ${responses.length} responses (need ${DECISION_THRESHOLDS.phased.minResponses}+)`);
    reasoning.push(`High urgency: ${Math.round(highUrgencyPercent * 100)}%`);
    reasoning.push(`Beta testers: ${betaTesters}`);
    reasoning.push('Consider focusing on other features');
  }

  return {
    totalResponses: responses.length,
    urgencyBreakdown,
    topRegulations,
    betaTesters,
    potentialSponsors,
    qualityScore,
    recommendation,
    reasoning,
  };
}

/**
 * Format analysis results for display
 */
function formatResults(results: AnalysisResults): string {
  const sections: string[] = [];

  sections.push('# Survey Analysis Results\n');
  sections.push(`**Total Responses:** ${results.totalResponses}`);
  sections.push(`**Quality Score:** ${Math.round(results.qualityScore)}/100`);
  sections.push(`**Recommendation:** ${results.recommendation.toUpperCase()}\n`);

  sections.push('## Urgency Breakdown\n');
  for (const [level, count] of Object.entries(results.urgencyBreakdown)) {
    const percent = Math.round((count / results.totalResponses) * 100);
    sections.push(`- ${level}: ${count} (${percent}%)`);
  }

  sections.push('\n## Top Requested Regulations\n');
  const sortedRegs = Object.entries(results.topRegulations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [reg, count] of sortedRegs) {
    sections.push(`- ${reg}: ${count} requests`);
  }

  sections.push('\n## Engagement\n');
  sections.push(`- Willing to beta test: ${results.betaTesters}`);
  sections.push(`- Potential sponsors: ${results.potentialSponsors}`);

  sections.push('\n## Recommendation Reasoning\n');
  for (const reason of results.reasoning) {
    sections.push(`- ${reason}`);
  }

  return sections.join('\n');
}

/**
 * Fetch survey responses from GitHub Discussion (placeholder)
 */
async function fetchResponses(discussionNumber: number): Promise<SurveyResponse[]> {
  // This is a placeholder - actual implementation would use GitHub API
  console.log(`Fetching responses from discussion #${discussionNumber}...`);

  // In production, this would use:
  // - GitHub GraphQL API to fetch discussion comments
  // - Parse structured form responses
  // - Return array of SurveyResponse objects

  return [];
}

/**
 * Main function
 */
async function main() {
  const discussionNumber = parseInt(process.argv[2] || '0', 10);

  if (discussionNumber === 0) {
    console.log('Usage: npx tsx scripts/analyze-survey-responses.ts [discussion-number]');
    console.log('\nExample: npx tsx scripts/analyze-survey-responses.ts 42');
    console.log('\nYou can find the discussion number in the URL:');
    console.log('https://github.com/owner/repo/discussions/42');
    console.log('                                            ^^');
    process.exit(1);
  }

  console.log('EU Regulations MCP - Survey Response Analyzer');
  console.log('='.repeat(50));
  console.log();

  // Fetch responses
  const responses = await fetchResponses(discussionNumber);

  if (responses.length === 0) {
    console.log('⚠️  No responses found yet.');
    console.log();
    console.log('This could mean:');
    console.log('- Survey just launched');
    console.log('- Wrong discussion number');
    console.log('- API token issues');
    console.log();
    console.log('Manual tracking in: docs/demand-validation-2026-q1.md');
    process.exit(0);
  }

  // Analyze responses
  const results = analyzeResponses(responses);

  // Display results
  console.log(formatResults(results));
  console.log();
  console.log('='.repeat(50));
  console.log(`Analysis complete. ${results.totalResponses} responses analyzed.`);
  console.log();
  console.log('Next steps:');
  console.log('1. Update docs/demand-validation-2026-q1.md with these results');
  console.log('2. Conduct user interviews with high-urgency respondents');
  console.log('3. Review decision criteria after survey closes');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { analyzeResponses, parseResponse, type SurveyResponse, type AnalysisResults };
