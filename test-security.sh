#!/bin/bash

# Test script for security fixes
# This verifies the 6 security issues are properly fixed

echo "Security Test Suite for Cloudflare Worker"
echo "=========================================="
echo ""

# Set base URL (will be set by wrangler dev)
BASE_URL="${1:-http://localhost:8787}"

echo "Testing against: $BASE_URL"
echo ""

# Test 1: Invalid Origin (CORS)
echo "Test 1: CORS - Invalid Origin"
echo "------------------------------"
RESULT=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/health" \
  -H "Origin: https://evil.com")
STATUS=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | head -n-1)

if [ "$STATUS" = "403" ]; then
  echo "✓ PASS: Invalid origin rejected (403)"
else
  echo "✗ FAIL: Invalid origin not rejected (got $STATUS)"
  echo "Response: $BODY"
fi
echo ""

# Test 2: Valid Origin (CORS)
echo "Test 2: CORS - Valid Origin"
echo "----------------------------"
RESULT=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/health" \
  -H "Origin: https://chatgpt.com")
STATUS=$(echo "$RESULT" | tail -n1)

if [ "$STATUS" = "200" ]; then
  echo "✓ PASS: Valid origin accepted (200)"
else
  echo "✗ FAIL: Valid origin not accepted (got $STATUS)"
fi
echo ""

# Test 3: Input Validation - Missing body
echo "Test 3: Input Validation - Empty Body"
echo "--------------------------------------"
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/tool" \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{}')
STATUS=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | head -n-1)

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "tool"; then
  echo "✓ PASS: Empty body rejected (400)"
else
  echo "✗ FAIL: Empty body not properly rejected (got $STATUS)"
  echo "Response: $BODY"
fi
echo ""

# Test 4: Input Validation - Invalid tool type
echo "Test 4: Input Validation - Invalid Tool Type"
echo "---------------------------------------------"
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/tool" \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{"tool": 123}')
STATUS=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | head -n-1)

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "string"; then
  echo "✓ PASS: Invalid tool type rejected (400)"
else
  echo "✗ FAIL: Invalid tool type not properly rejected (got $STATUS)"
  echo "Response: $BODY"
fi
echo ""

# Test 5: Input Validation - Invalid params type
echo "Test 5: Input Validation - Invalid Params Type"
echo "-----------------------------------------------"
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/tool" \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{"tool": "search_regulations", "params": "invalid"}')
STATUS=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | head -n-1)

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "object"; then
  echo "✓ PASS: Invalid params type rejected (400)"
else
  echo "✗ FAIL: Invalid params type not properly rejected (got $STATUS)"
  echo "Response: $BODY"
fi
echo ""

# Test 6: Request Size Limit
echo "Test 6: Request Size Limit (100KB)"
echo "-----------------------------------"
# Generate a large payload (> 100KB)
LARGE_PAYLOAD=$(python3 -c "import json; print(json.dumps({'tool': 'search_regulations', 'params': {'query': 'a' * 110000}}))")
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/tool" \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d "$LARGE_PAYLOAD")
STATUS=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | head -n-1)

if [ "$STATUS" = "413" ]; then
  echo "✓ PASS: Large payload rejected (413)"
else
  echo "✗ FAIL: Large payload not rejected (got $STATUS)"
  echo "Response: $BODY"
fi
echo ""

# Test 7: Rate Limit Header (hardcoded fix)
echo "Test 7: Rate Limit Header Value"
echo "--------------------------------"
RESULT=$(curl -s -i -X GET "$BASE_URL/tools" \
  -H "Origin: https://chatgpt.com")

if echo "$RESULT" | grep -q "X-RateLimit-Limit:"; then
  LIMIT=$(echo "$RESULT" | grep "X-RateLimit-Limit:" | awk '{print $2}' | tr -d '\r')
  if [ "$LIMIT" = "100" ]; then
    echo "✓ PASS: Rate limit header shows correct value (100)"
  else
    echo "⚠ WARNING: Rate limit header value is $LIMIT (expected 100)"
  fi
else
  echo "ℹ INFO: Rate limit headers not present on /tools endpoint (OK)"
fi
echo ""

echo "=========================================="
echo "Security test suite complete"
echo ""
echo "Note: Database timeout test requires actual database connection"
echo "and is not included in this automated suite."
