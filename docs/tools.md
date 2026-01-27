# Available Tools

## `search_regulations`
Full-text search across all regulations. Returns **smart snippets** (32 tokens each, safe for context).

```
"Search for incident reporting requirements across all regulations"
→ Returns matching articles from DORA, NIS2, GDPR with context
```

**Token usage:** Low (snippets only)

---

## `get_article`
Retrieve a specific article with full text and context.

```
"Get DORA Article 17"
→ Returns ICT-related incident management process requirements
```

**⚠️ Token usage:** Variable (500-70,000 tokens per article). Large articles (MDR, IVDR, Machinery) include truncation warnings. Use search first to find relevant articles.

---

## `get_recital`
Retrieve legislative intent and interpretation guidance from regulation preambles.

```
"Get GDPR Recital 83"
→ Returns: Context for "appropriate technical measures"
  (encryption, pseudonymization, resilience testing)
```

---

## `list_regulations`
List available regulations or show detailed structure.

```
"List all regulations"
→ Returns overview of all 37 regulations with article counts
```

---

## `get_definitions`
Get official definitions from any regulation.

```
"What does NIS2 define as an 'essential entity'?"
→ Returns Article 3 definition + criteria
```

---

## `compare_requirements`
Search and compare articles across multiple regulations on a specific topic. Returns matching articles from each regulation with snippets showing how they address the topic.

```
"Compare incident reporting timelines between DORA and NIS2"
→ Returns matching articles from DORA (Art 19) and NIS2 (Art 23)
  with text snippets highlighting timeline requirements
```

---

## `check_applicability`
Determine if a regulation applies to an entity type.

```
"Does DORA apply to a Swedish fintech with 50 employees?"
→ Yes, if providing financial services covered under Article 2
```

---

## `map_controls`
Map security framework controls to regulation requirements. Supports ISO 27001:2022 and NIST CSF.

```
"Which regulations require access control (ISO 27001 A.5.15)?"
→ Returns mappings to GDPR Art 32, DORA Art 9, NIS2 Art 21

"Map NIST CSF incident response controls to EU regulations"
→ Returns RS.MA-01 mappings to GDPR Art 33-34, NIS2 Art 23, DORA Art 17-19
```
