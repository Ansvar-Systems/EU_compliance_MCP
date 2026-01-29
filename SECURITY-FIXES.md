# Security Fixes - Cloudflare Worker Implementation

This document details the security vulnerabilities that were identified and fixed before production deployment.

## Summary

All 6 identified security issues have been addressed:
- 3 Critical issues (CORS, Input Validation, Rate Limit Header)
- 3 Important issues (Error Sanitization, Request Size Limits, Database Timeout)

## Critical Issues Fixed

### 1. CORS Default Origin Vulnerability (CRITICAL)

**Issue:** Requests from non-allowed origins would default to `https://chat.openai.com`, effectively allowing any origin to access the API.

**Fix:**
- Modified `corsHeaders()` to return `null` for non-allowed origins
- Added `mergeCorsHeaders()` helper function to handle null case
- All endpoints now return `403 Forbidden` for non-allowed origins
- Updated OPTIONS preflight handler to reject invalid origins

**Files Changed:**
- `src/worker.ts` (lines 106-161)

**Test:**
```bash
# Should return 403
curl -X GET http://localhost:8787/health -H "Origin: https://evil.com"

# Should return 200
curl -X GET http://localhost:8787/health -H "Origin: https://chatgpt.com"
```

---

### 2. Missing Input Validation (CRITICAL)

**Issue:** The `/api/tool` endpoint did not validate request body structure, allowing malformed requests through.

**Fix:**
- Added validation for `body` to be an object
- Added validation for `body.tool` to be a string
- Added validation for `body.params` to be an object (if present)
- Returns `400 Bad Request` with clear error messages

**Files Changed:**
- `src/worker.ts` (lines 347-422)

**Test:**
```bash
# Invalid body (not an object)
curl -X POST http://localhost:8787/api/tool \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '[]'

# Missing tool field
curl -X POST http://localhost:8787/api/tool \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{}'

# Invalid tool type
curl -X POST http://localhost:8787/api/tool \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{"tool": 123}'

# Invalid params type
curl -X POST http://localhost:8787/api/tool \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d '{"tool": "search_regulations", "params": "invalid"}'
```

---

### 3. Hardcoded Rate Limit Header (CRITICAL)

**Issue:** The `rateLimitResponse()` function used hardcoded `'100'` instead of the actual rate limit value.

**Fix:**
- Added `limit` parameter to `rateLimitResponse()`
- Dynamically set `X-RateLimit-Limit` header from parameter
- Updated all calls to pass actual limit value

**Files Changed:**
- `src/worker.ts` (lines 233-271, 305)

**Test:**
```bash
# Trigger rate limit (after 100 requests)
# Check X-RateLimit-Limit header value matches configured limit
for i in {1..101}; do
  curl -X POST http://localhost:8787/api/tool \
    -H "Content-Type: application/json" \
    -H "Origin: https://chatgpt.com" \
    -d '{"tool": "list_regulations"}' \
    -i
done
```

---

## Important Issues Fixed

### 4. Error Message Exposure (IMPORTANT)

**Issue:** Internal error messages and stack traces were exposed to clients, potentially revealing sensitive implementation details.

**Fix:**
- Added `NODE_ENV` to environment interface
- Log full error details to console for debugging
- Return generic "An error occurred" message in production
- Only include debug info if `env.NODE_ENV === 'development'`

**Files Changed:**
- `src/worker.ts` (lines 52-56, 502-537)
- `wrangler.toml` (NODE_ENV configuration)

**Test:**
```bash
# In production (NODE_ENV=production)
# Should return: "An error occurred while processing your request"

# In development (NODE_ENV=development)
# Should return: actual error message for debugging
```

---

### 5. Missing Request Size Limits (IMPORTANT)

**Issue:** No check on request body size before parsing, allowing potential DoS via large payloads.

**Fix:**
- Check `Content-Length` header before parsing JSON
- Maximum request size: 100KB (102,400 bytes)
- Return `413 Payload Too Large` if exceeded

**Files Changed:**
- `src/worker.ts` (lines 308-336)

**Test:**
```bash
# Generate 110KB payload (should be rejected)
python3 -c "import json; print(json.dumps({'tool': 'search_regulations', 'params': {'query': 'a' * 110000}}))" | \
curl -X POST http://localhost:8787/api/tool \
  -H "Content-Type: application/json" \
  -H "Origin: https://chatgpt.com" \
  -d @-
```

---

### 6. Database Query Timeout (IMPORTANT)

**Issue:** No timeout on database queries, allowing long-running queries to hang the worker.

**Fix:**
- Wrapped all queries with 10-second timeout using `Promise.race()`
- Throw descriptive error on timeout
- Log timeout errors for debugging

**Files Changed:**
- `src/database/postgres-adapter.ts` (lines 24-52)

**Test:**
```sql
-- This requires access to the database and is not easily automated
-- Create a slow query (e.g., with pg_sleep)
SELECT pg_sleep(15);  -- Should timeout after 10 seconds
```

---

## Testing

### Automated Tests

Run the security test suite:

```bash
# Start dev server
npm run dev

# In another terminal, run tests
./test-security.sh http://localhost:8787
```

### Manual Testing

1. **CORS Test:**
   - Use browser DevTools to send requests from different origins
   - Verify only allowed origins receive CORS headers

2. **Input Validation Test:**
   - Send malformed JSON payloads
   - Verify clear 400 error messages

3. **Rate Limiting Test:**
   - Send 101 requests from the same IP
   - Verify 429 response on 101st request
   - Check rate limit headers are correct

4. **Request Size Test:**
   - Send payloads of varying sizes
   - Verify 413 response for payloads > 100KB

5. **Error Handling Test:**
   - Trigger internal errors (e.g., invalid database query)
   - Verify generic message in production
   - Verify detailed message in development

## Deployment Checklist

Before deploying to production:

- [x] All security fixes implemented
- [x] Code compiles without errors (`npm run build`)
- [x] Security test suite passes
- [ ] Set `NODE_ENV=production` in wrangler.toml
- [ ] Set `DATABASE_URL` secret via `wrangler secret put DATABASE_URL`
- [ ] Test with actual production database
- [ ] Verify CORS headers in production
- [ ] Monitor rate limiting in production
- [ ] Review error logs for sanitization

## Git Commits

The fixes were committed in logical groups:

1. **Commit 1:** CORS security fix (critical)
   - SHA: 21438db
   - Fixed CORS to reject non-allowed origins

2. **Commit 2:** Database query timeout (important)
   - SHA: 16883dd
   - Added 10-second timeout protection

Additional changes (input validation, request size limits, error sanitization) were included in Commit 1.

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Cloudflare Workers Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)
- [CORS Specification](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

## Maintainer Notes

### Adding New Endpoints

When adding new endpoints, ensure:

1. Use `mergeCorsHeaders()` for all responses
2. Validate all input parameters
3. Check request size limits for POST/PUT endpoints
4. Sanitize error messages (use `env.NODE_ENV`)
5. Add rate limiting if needed
6. Test with security test suite

### Example Secure Endpoint

```typescript
async function handleNewEndpoint(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get('Origin') || undefined;

  // Check request size
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength) > MAX_SIZE) {
    const headers = mergeCorsHeaders(baseHeaders, origin);
    if (headers instanceof Response) return headers;
    return new Response(
      JSON.stringify({ error: 'Payload too large' }),
      { status: 413, headers }
    );
  }

  try {
    const body = await request.json();

    // Validate input
    if (!body || typeof body !== 'object') {
      const headers = mergeCorsHeaders(baseHeaders, origin);
      if (headers instanceof Response) return headers;
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers }
      );
    }

    // Process request...
    const result = processRequest(body);

    // Return response
    const headers = mergeCorsHeaders(baseHeaders, origin);
    if (headers instanceof Response) return headers;
    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = env.NODE_ENV === 'development'
      ? error instanceof Error ? error.message : 'Unknown error'
      : 'An error occurred';

    const headers = mergeCorsHeaders(baseHeaders, origin);
    if (headers instanceof Response) return headers;
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers }
    );
  }
}
```

---

**Last Updated:** 2026-01-29
**Reviewed By:** Claude Sonnet 4.5
**Status:** All critical and important issues resolved
