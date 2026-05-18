# Serving EU-Regulations-MCP as a Bindu agent

A complete, end-to-end example of how to take this Model Context
Protocol server — which covers 61 EU regulations including GDPR,
NIS2, DORA, the EU AI Act, eIDAS, the Cyber Resilience Act, MiFID II,
PSD2, MDR, and the Data Act — and turn it into a fully networked,
identity-bearing agent on **[Bindu](https://github.com/getbindu/Bindu)**,
a decentralized framework for building autonomous AI agents as
microservices.

> This example is a teaching walk-through. Each step explains *why*
> before *how*, so you can adapt the pattern to other MCP servers or
> other Bindu deployments. By the end you will have an EU-compliance
> agent that speaks the A2A protocol over HTTP, advertises itself in
> a `.well-known` agent card, and signs every artifact it returns
> with an Ed25519 key derived from its decentralized identifier.

---

## Why pair EU-Regulations-MCP with Bindu?

The Model Context Protocol is excellent at *delivering tools to a
language model*. It does not, by itself, tell the outside world
anything about the agent using those tools. A second agent — or a
human user reaching the system over the network — has no way to ask
"what is this agent, what does it know, can I trust the compliance
answer it just gave me?".

That is exactly the question **Bindu** answers. Bindu wraps an
ordinary in-process agent and produces:

1. A **decentralized identity** of the form
   `did:bindu:<author>:<name>:<uuid>`, derived deterministically from
   the agent's config so the same code always mints the same DID.
2. A discoverable **agent card** at `/.well-known/agent.json` listing
   the agent's skills, capabilities, input modes, output modes, and
   trust posture.
3. A JSON-RPC 2.0 endpoint that speaks the **A2A protocol** — the
   agent-to-agent message format used by the rest of the Bindu fleet.
4. **Ed25519 signatures on every artifact** the agent returns, bound
   to the agent's DID, so downstream consumers can verify origin
   without trusting the transport.

In short: MCP gives Lex-EU its eyes (19 tools over the EU
regulations corpus); Bindu gives Lex-EU a name, an address, and a
passport.

---

## Architecture

```
        ┌────────────────────────────────────────────────────────┐
        │ Client (curl, another Bindu agent, the inbox UI, …)    │
        └────────────────────────────────────────────────────────┘
                              │ JSON-RPC 2.0 (A2A protocol)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ Bindu agent server  —  http://localhost:3773           │
        │   • /.well-known/agent.json  (agent card + DID)        │
        │   • /did/resolve              (DID document)           │
        │   • message/send, tasks/get   (JSON-RPC methods)       │
        │   • Ed25519-signs every artifact                       │
        └────────────────────────────────────────────────────────┘
                              │ bindufy(config, handler)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ Agno Agent  (`Lex-EU`)  +  Windsurf-style prompt       │
        └────────────────────────────────────────────────────────┘
                              │ Agno MCPTools (stdio)
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ @ansvar/eu-regulations-mcp   (this repo, built locally)│
        │   • 19 MCP tools                                       │
        │   • SQLite over the EUR-Lex corpus                     │
        └────────────────────────────────────────────────────────┘
```

Two boundaries are worth pausing on:

- The **stdio boundary** between Bindu and this MCP server. Bindu
  spawns `node dist/index.js` (this repository's built MCP server)
  once and reuses the connection for the lifetime of the agent.
- The **HTTP boundary** between Bindu and the outside world. This is
  where the DID, the signatures, and the JSON-RPC schema live.

---

## Prerequisites

| Requirement       | Why                                                                |
| ----------------- | ------------------------------------------------------------------ |
| Python ≥ 3.12     | Bindu requires 3.12+.                                              |
| `uv`              | Used to manage the example's virtual environment.                  |
| Node.js ≥ 18      | To build and run this repository's MCP server.                     |
| `pnpm`            | This repository uses pnpm workspaces (see `pnpm-workspace.yaml`).  |
| An LLM API key    | Either `OPENROUTER_API_KEY` or `OPENAI_API_KEY`. OpenRouter works  |
|                   | well for non-US users and is preferred by this example.            |

---

## Step 1 — Build the EU-Regulations-MCP server from source

From the repository root (the `EU_compliance_MCP/` directory):

```bash
pnpm install
pnpm run build
```

The build produces `dist/index.js` — the stdio MCP server that Bindu
will spawn. The SQLite corpus is shipped in this repository at
`data/regulations.db` (≈36 MB), so no separate download step is
required. On first read the server copies it to `/tmp/regulations.db`
to side-step a known WASM-SQLite locking quirk on overlay
filesystems; see `src/database/ensure-readable-db.ts`.

---

## Step 2 — Install the Bindu example

```bash
cd examples/bindu-agent
cp .env.example .env       # then edit .env with your API key
uv sync                    # installs bindu, agno, openai, mcp, python-dotenv
```

If you prefer `pip`:

```bash
pip install bindu agno openai mcp python-dotenv
```

---

## Step 3 — Configure the model backend

Open `.env` and set **one** of the following:

```bash
# Option A — OpenRouter (recommended)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o

# Option B — OpenAI direct
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

You may use any OpenRouter model slug — `anthropic/claude-3.7-sonnet`,
`google/gemini-2.5-pro`, and `meta-llama/llama-3.3-70b-instruct` all
work. The agent's behaviour is shaped almost entirely by the prompt
in `prompt.py`, so the model choice is mostly a quality-versus-cost
trade-off.

---

## Step 4 — Launch the Bindu agent

```bash
uv run python bindu_agent.py
```

On a successful launch you will see Bindu print its identity, its
endpoints, and its uvicorn banner:

```
Agent ID: <uuid>
Agent DID:
  did:bindu:bindu_builder_at_getbindu_com:eu_compliance_agent:<uuid>

Protocol Endpoints:
  - Agent Endpoint:  http://localhost:3773/
  - Agent Card:      http://localhost:3773/.well-known/agent.json
  - DID Resolution:  http://localhost:3773/did/resolve

INFO:     Uvicorn running on http://localhost:3773
```

Notice the DID is deterministic — it is `sha256(author + name)`
truncated to 32 hex characters and formatted as a UUID. The same
config always produces the same DID, which is how Bindu keeps agent
identities stable across redeploys.

> **What is happening under the hood?** On the very first request,
> the agent lazily spawns `node dist/index.js` (this repository's
> built MCP server). The MCP server opens the SQLite corpus
> read-only and serves the 19 MCP tools over stdio. Bindu and the
> MCP keep talking to each other over that stdio pipe for the rest
> of the agent's life.

---

## Step 5 — Inspect the agent card

Before asking the agent anything, look at how it advertises itself.
This is what any other Bindu agent on the network would discover:

```bash
curl -s http://localhost:3773/.well-known/agent.json | python -m json.tool
```

Key fields to notice:

| Field                          | What it tells a caller                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `id`                           | The agent's UUID — same value embedded in the DID.                           |
| `capabilities.extensions`      | The active Bindu extensions; you will see the DID extension here.            |
| `skills[].name`                | The named skill the agent has registered (`eu-compliance-research`).         |
| `defaultInputModes` / `Output` | The MIME types the agent will accept and produce.                            |
| `agentTrust`                   | The trust posture; defaults to permissive in local development.              |

If you also resolve the DID document, you get the agent's public
key — which is what you will use to verify the signatures in step 6:

```bash
curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
       \"method\":\"did/resolve\",
       \"params\":{\"did\":\"<paste-the-DID-here>\"}}" | python -m json.tool
```

---

## Step 6 — Ask the agent a question (the full A2A round-trip)

The A2A protocol is JSON-RPC 2.0 with a strict schema. Three small
points trip up most newcomers, so we will name them up front:

1. The JSON-RPC top-level `id`, plus `message_id`, `context_id`, and
   `task_id`, **must all be UUIDs**.
2. `params.message.kind` must literally be the string `"message"`.
3. `params.configuration.accepted_output_modes` is required.

The example below uses the shell to mint fresh UUIDs and then makes
two calls: one to start the task, one to fetch its result.

```bash
# Mint UUIDs for the JSON-RPC envelope and the message identifiers.
MID=$(uuidgen | tr A-Z a-z)
CID=$(uuidgen | tr A-Z a-z)
TID=$(uuidgen | tr A-Z a-z)

# 1) Send the question. The server returns the task it has just
#    created. Capture its real task_id — Bindu assigns its own and
#    will ignore the one you proposed if it does not match server
#    state.
RESP=$(curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d @- <<JSON
{
  "jsonrpc": "2.0",
  "id": "$MID",
  "method": "message/send",
  "params": {
    "configuration": {
      "accepted_output_modes": ["text/plain", "text/markdown"]
    },
    "message": {
      "message_id": "$MID",
      "context_id": "$CID",
      "task_id":    "$TID",
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "What are the risk management requirements under NIS2 Article 21? Quote the article verbatim and give the ELI-style citation."
        }
      ]
    }
  }
}
JSON
)
SERVER_TID=$(echo "$RESP" | python -c "import json,sys;print(json.load(sys.stdin)['result']['id'])")
echo "Bindu accepted task: $SERVER_TID"

# 2) Poll until the task is complete. In production you would use
#    streaming or push notifications instead, but polling is the
#    simplest way to see the lifecycle.
while : ; do
  STATE=$(curl -s -X POST http://localhost:3773/ \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
         \"method\":\"tasks/get\",
         \"params\":{\"task_id\":\"$SERVER_TID\"}}" \
    | python -c "import json,sys;print(json.load(sys.stdin)['result']['status']['state'])")
  echo "task state: $STATE"
  [ "$STATE" = "completed" ] && break
  sleep 1
done

# 3) Fetch the final artifact.
curl -s -X POST http://localhost:3773/ \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"$(uuidgen | tr A-Z a-z)\",
       \"method\":\"tasks/get\",
       \"params\":{\"task_id\":\"$SERVER_TID\"}}" \
  | python -m json.tool
```

A successful response looks something like this (trimmed for
readability):

```json
{
  "result": {
    "id": "<task uuid>",
    "status": { "state": "completed", "timestamp": "..." },
    "artifacts": [
      {
        "artifact_id": "<artifact uuid>",
        "name": "result",
        "parts": [
          {
            "kind": "text",
            "text": "NIS2 Article 21 requires essential and important entities to take appropriate and proportionate technical, operational and organisational measures …\n\n**Citation**: Directive (EU) 2022/2555 (NIS2) art. 21",
            "metadata": {
              "did.message.signature": "5a8kqjwKKSAxdJhPWyzn7DeWGp6VQXuwyncHmMCkdna6MFcDVRG3p…"
            }
          }
        ]
      }
    ]
  }
}
```

The `did.message.signature` field is the part that makes Bindu
materially different from a plain HTTP wrapper. It is the agent
asserting cryptographically: *this exact text was produced by the
DID listed in my agent card*. Any other Bindu agent can verify the
signature against the public key from `/did/resolve` and reject the
artifact if it has been tampered with in transit.

---

## More sample queries

Below are five more questions, each chosen to exercise a different
tool in the EU-Regulations-MCP. Replace the `text` field in the
`message/send` call from step 6 with any of these.

```text
How long do I have to report a security incident under DORA? One sentence with ELI-style citation.
```
*Exercises `search_regulations` or `get_article` against DORA art. 19 / 19.*

```text
Compare GDPR breach notification (art. 33) with NIS2 incident reporting (art. 23).
```
*Exercises `compare_requirements` across two instruments.*

```text
Does the EU AI Act apply to a recruitment screening tool used inside an EU subsidiary?
```
*Exercises `check_applicability` with concrete in-scope/out-of-scope reasoning.*

```text
Map ISO 27001 Annex A controls to DORA ICT risk management obligations.
```
*Exercises `map_controls` — controls framework ↔ regulatory requirement.*

```text
Quote recital 27 of the EU AI Act verbatim.
```
*Exercises `get_recital` — recital text is treated as authoritative
interpretive context.*

You can also drive the agent from another Bindu agent — the same
JSON-RPC schema is what every Bindu service speaks.

---

## File layout

```
examples/bindu-agent/
├── README.md                              (this file)
├── bindu_agent.py                         (the bindufied agent)
├── prompt.py                              (Windsurf-style system prompt)
├── pyproject.toml                         (bindu, agno, openai, mcp, python-dotenv)
├── .env.example                           (LLM provider + key)
├── .gitignore                             (Python venv, .bindu/ keypair, .env, logs)
└── skills/
    └── eu-compliance-research/
        └── skill.yaml                     (Bindu skill manifest)
```

---

## Glossary

| Term            | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Bindu**       | A decentralized agent framework. Wraps an agent in a DID identity, a JSON-RPC server, and signed artifacts.      |
| **A2A**         | Agent-to-agent protocol. JSON-RPC 2.0 with a Bindu-specific schema for `message/send`, `tasks/get`, and friends. |
| **DID**         | Decentralized identifier. Here: `did:bindu:<author>:<name>:<uuid>`, derived from the agent's config.             |
| **Skill**       | A named capability the agent advertises in its agent card.                                                       |
| **Artifact**    | A unit of agent output (text, file, structured data) returned as part of a task result. Bindu signs every one.   |
| **CELEX**       | The EU's unique document identifier (e.g., `32016R0679` is the GDPR).                                            |
| **ELI**         | European Legislation Identifier — the citation form `Regulation (EU) <year>/<number>`.                           |
| **Lex-EU**      | The conventional Bindu name for this EU-compliance agent.                                                        |

---

## Further reading

- **Bindu**: <https://github.com/getbindu/Bindu> · <https://docs.getbindu.com>
- **Agno**: <https://docs.agno.com>
- **EU-Regulations-MCP** (this repository): the source of the 19 MCP
  tools, plus `TOOLS.md` and `TEST_QUERIES.md` for more examples.
- **A2A protocol**: see `bindu/common/protocol/types.py` in the Bindu
  source for the canonical schemas.

---

## Disclaimer

This example is a research demonstration. The corpus covers EU
instruments only — national transpositions, CJEU case law, and
member-state implementing legislation are not included — and the
agent is **not** legal or compliance advice. For any matter that
requires advice, consult qualified counsel or a certified compliance
professional. Always verify critical citations against
[EUR-Lex](https://eur-lex.europa.eu) before relying on them in
professional work.
