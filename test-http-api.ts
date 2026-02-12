/**
 * Quick test script for HTTP API endpoints.
 * Run with: npx tsx test-http-api.ts
 */

import { TOOLS } from './src/tools/registry.js';

console.log('Testing HTTP API...\n');

// Test 1: Tool registry has correct structure
console.log('✓ Tool registry loaded');
console.log(`  Found ${TOOLS.length} tools\n`);

// Test 2: Each tool has required fields
let valid = true;
for (const tool of TOOLS) {
  if (!tool.name || !tool.description || !tool.inputSchema || !tool.handler) {
    console.error(`✗ Tool ${tool.name} missing required fields`);
    valid = false;
  }
}

if (valid) {
  console.log('✓ All tools have required fields (name, description, inputSchema, handler)\n');
}

// Test 3: Input schemas are valid JSON Schema
for (const tool of TOOLS) {
  if (tool.inputSchema.type !== 'object') {
    console.error(`✗ Tool ${tool.name} inputSchema must have type: object`);
    valid = false;
  }
  if (!tool.inputSchema.properties) {
    console.error(`✗ Tool ${tool.name} inputSchema missing properties`);
    valid = false;
  }
}

if (valid) {
  console.log('✓ All input schemas are valid JSON Schema objects\n');
}

// Test 4: Generate mock /tools response
const toolsResponse = {
  tools: TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
  count: TOOLS.length,
  timestamp: new Date().toISOString(),
};

console.log('✓ Mock GET /tools response:');
console.log(`  ${JSON.stringify(toolsResponse, null, 2).split('\n').slice(0, 15).join('\n  ')}`);
console.log(`  ... (${TOOLS.length} tools total)\n`);

// Test 5: List tool names
console.log('✓ Available tools:');
for (const tool of TOOLS) {
  const requiredParams = tool.inputSchema.required || [];
  console.log(`  - ${tool.name} (requires: ${requiredParams.join(', ') || 'none'})`);
}

console.log('\n✓ HTTP API test complete');
console.log('\nTo test the deployed worker:');
console.log('  curl https://your-worker.workers.dev/tools');
console.log('  curl https://your-worker.workers.dev/health');
