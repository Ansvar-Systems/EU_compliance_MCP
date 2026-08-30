"""EU compliance research agent, served as a Bindu agent.

This example shows how to take the EU-Regulations-MCP server from
this repository and expose it as a fully networked, DID-identified
agent on **Bindu** — a decentralized agent framework for building
autonomous AI agents as microservices.

Bindu turns an in-process agent into:

  • a JSON-RPC 2.0 endpoint that speaks the A2A (agent-to-agent)
    protocol on ``http://localhost:3773``,
  • a discoverable agent card at ``/.well-known/agent.json`` listing
    skills and capabilities,
  • a decentralized identity at ``did:bindu:<author>:<name>:<uuid>``
    derived deterministically from your config, and
  • Ed25519-signed artifacts: every text part returned to a client
    carries a ``did.message.signature`` so any downstream agent can
    verify origin without trusting the transport.

The agent itself is built with `agno <https://docs.agno.com>`_ and
uses Agno's ``MCPTools`` to bridge the EU-Regulations-MCP tools into
the model's tool-call loop.

Run::

    cp .env.example .env          # set OPENROUTER_API_KEY (or OPENAI_API_KEY)
    uv sync                       # or: pip install -r requirements.txt
    uv run python bindu_agent.py

See the README in this directory for end-to-end curl probes.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.models.openrouter import OpenRouter
from agno.tools.mcp import MCPTools
from mcp import StdioServerParameters

from bindu.penguin.bindufy import bindufy

from prompt import SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 1. Spawn the EU-Regulations-MCP server over stdio
# ---------------------------------------------------------------------------
# This example assumes you have built the MCP server from source at the
# root of this repository:
#
#     pnpm install
#     pnpm run build
#
# Bindu then spawns ``node dist/index.js`` once and reuses the
# connection. The MCP server reads its SQLite corpus from
# ``data/regulations.db`` (shipped in this repository) and copies it
# to ``/tmp/regulations.db`` on first read to side-step a known
# WASM-SQLite locking quirk — see ``src/database/ensure-readable-db.ts``.
# ---------------------------------------------------------------------------

DEFAULT_MCP_ENTRY = "../../dist/index.js"


def build_server_params() -> StdioServerParameters:
    raw = os.environ.get("EU_REGULATIONS_MCP_ENTRY", DEFAULT_MCP_ENTRY)
    entry = Path(raw)
    if not entry.is_absolute():
        entry = (Path(__file__).parent / entry).resolve()
    if not entry.exists():
        raise FileNotFoundError(
            f"EU-Regulations-MCP entry not found at {entry}. From the "
            f"repository root, run: pnpm install && pnpm run build"
        )
    env = {"PATH": os.environ.get("PATH", "")}
    # The MCP server honours EU_COMPLIANCE_DB_PATH for tests; pass it
    # through if the operator sets it.
    if db := os.environ.get("EU_COMPLIANCE_DB_PATH"):
        env["EU_COMPLIANCE_DB_PATH"] = db
    return StdioServerParameters(command="node", args=[str(entry)], env=env)


# ---------------------------------------------------------------------------
# 2. Choose a model backend
# ---------------------------------------------------------------------------
# The example supports two backends out of the box. Set ``LLM_PROVIDER``
# explicitly, or let the agent auto-select: if only
# ``OPENROUTER_API_KEY`` is present we route through OpenRouter,
# otherwise we fall back to OpenAI. Any OpenRouter slug works (e.g.
# ``openai/gpt-4o``, ``anthropic/claude-3.7-sonnet``).
# ---------------------------------------------------------------------------


def build_model() -> Any:
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
    has_or = bool(os.environ.get("OPENROUTER_API_KEY"))
    has_oai = bool(os.environ.get("OPENAI_API_KEY"))
    provider = provider or ("openrouter" if has_or and not has_oai else "openai")
    if provider == "openrouter":
        return OpenRouter(id=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o"))
    if provider == "openai":
        return OpenAIChat(id=os.environ.get("OPENAI_MODEL", "gpt-4o"))
    raise ValueError(f"unknown LLM_PROVIDER={provider!r}")


def build_agent(mcp_tools: MCPTools) -> Agent:
    return Agent(
        name="Lex-EU",
        model=build_model(),
        tools=[mcp_tools],
        instructions=SYSTEM_PROMPT,
        markdown=True,
    )


# ---------------------------------------------------------------------------
# 3. Hold the MCP connection open for the agent's lifetime
# ---------------------------------------------------------------------------
# Bindu invokes ``handler`` once per incoming A2A request, on its own
# event loop. If we open a fresh ``MCPTools`` context per request we
# pay a ~1.5–2 second node cold-start every time and SQLite has to
# re-open the corpus. Instead we open the connection lazily on the
# first request behind an ``asyncio.Lock`` and reuse it from every
# subsequent request. This is the supported Agno pattern for
# long-lived server use.
# ---------------------------------------------------------------------------

_mcp_tools: MCPTools | None = None
_agent: Agent | None = None
_init_lock = asyncio.Lock()


async def _ensure_agent() -> Agent:
    global _mcp_tools, _agent
    if _agent is not None:
        return _agent
    async with _init_lock:
        if _agent is None:
            _mcp_tools = MCPTools(server_params=build_server_params())
            await _mcp_tools.__aenter__()
            _agent = build_agent(_mcp_tools)
    assert _agent is not None
    return _agent


# ---------------------------------------------------------------------------
# 4. The Bindu handler
# ---------------------------------------------------------------------------
# Bindu validates that the handler has a single parameter literally
# named ``messages``. The framework passes the latest user-message
# string (not a list); see ``bindu/penguin/manifest.py::_resolve_params``
# in the Bindu source. Returning a string is sufficient — Bindu wraps
# it into an A2A artifact, signs it with the agent's Ed25519 key, and
# returns it as the task result.
# ---------------------------------------------------------------------------


async def handler(messages: str) -> str:
    agent = await _ensure_agent()
    result = await agent.arun(input=messages)
    content = getattr(result, "content", None) or getattr(result, "response", None)
    return content if isinstance(content, str) else str(result)


# ---------------------------------------------------------------------------
# 5. Bindu agent manifest
# ---------------------------------------------------------------------------
# ``bindufy`` reads this dict to mint the agent's DID, render the
# ``/.well-known/agent.json`` card, register the skill manifests, and
# bring up the JSON-RPC server. The author + name pair is hashed into
# the agent UUID, so the same config always produces the same DID.
# ---------------------------------------------------------------------------

config: dict[str, Any] = {
    "author": "bindu.builder@getbindu.com",
    "name": "eu_compliance_agent",
    "description": (
        "Citation-grounded EU compliance research, served on Bindu. Answers "
        "questions about GDPR, NIS2, DORA, the EU AI Act, the Cyber "
        "Resilience Act, eIDAS, DSA/DMA, the Data Act, MDR, MiFID II, "
        "PSD2 and others, with verbatim article and recital text sourced "
        "from EUR-Lex via the Ansvar eu-regulations-mcp server. Research "
        "only — not legal advice."
    ),
    "version": "0.1.0",
    "deployment": {
        "url": f"http://localhost:{os.environ.get('BINDU_PORT', '3773')}",
        "expose": True,
        "cors_origins": ["http://localhost:5173", "http://localhost:3775"],
    },
    "skills": ["skills/eu-compliance-research"],
}


if __name__ == "__main__":
    bindufy(config, handler)
