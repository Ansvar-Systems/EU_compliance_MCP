# EU Regulations MCP Server 1.0.0 🎉

**The EUR-Lex alternative for the AI age — now production-ready.**

## What's New in 1.0.0

### 🚀 Production-Ready Release

This marks the first production release of the EU Regulations MCP Server with comprehensive, verified coverage of European regulations. After extensive testing and validation, we're confident this is ready for real-world compliance work.

### 📊 Coverage Highlights

- **49 EU Regulations** with full text and searchability
- **2,528 Articles** covering cybersecurity, finance, healthcare, product safety
- **3,869 Recitals** providing legislative context
- **1,226 Official Definitions** for precise terminology
- **709 Control Mappings** to ISO 27001:2022 and NIST CSF 2.0
- **407 Evidence Requirements** for audit preparation
- **323 Sector Applicability Rules** for compliance scoping

**Coverage Score: 94% (A+ Rating)**

### ⭐ New Regulations

**EU Chips Act (32023R1781)**
- Complete semiconductor manufacturing regulatory framework
- 41 articles, 84 recitals, 24 definitions
- Applicability rules for electronics, automotive, digital infrastructure
- ISO 27001 & NIST CSF control mappings

**Critical Raw Materials Act (32024R1252)**
- Supply chain resilience for critical materials
- 49 articles, 75 recitals, 64 definitions
- Mining, battery manufacturing, renewable energy sectors
- Strategic autonomy and security of supply focus

### 🔒 Security & Compliance

**Production Security Stack:**
- ✅ Semgrep static analysis (no critical issues)
- ✅ Gitleaks secret scanning (zero secrets in repo)
- ✅ OSSF Scorecard (8.7/10 score)
- ✅ Docker container vulnerability scanning
- ✅ PostgreSQL SSL/TLS certificate validation
- ✅ npm audit clean (all high/moderate vulnerabilities patched)

### 🌐 Deployment Options

**Now supporting multiple deployment modes:**

1. **Local (MCP Protocol)** - Claude Desktop, Cursor, VS Code
2. **HTTP REST API** - For web applications and services
3. **Cloudflare Workers** - Edge deployment with PostgreSQL backend
4. **Self-Hosted** - Docker containers with your infrastructure

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment guides.

### 📡 Auto-Update Monitoring

Daily EUR-Lex monitoring ensures you're always working with current regulation text:

- Automated freshness checks at 06:00 UTC
- GitHub Issues created when updates are detected
- Puppeteer-based fetching bypasses EUR-Lex WAF
- Source registry drives monitoring (no hardcoded lists)

### 🎯 What's Included

**Core Cybersecurity:**
GDPR, NIS2, DORA (+ 10 RTS/ITS), AI Act, CRA, Cybersecurity Act, Cyber Solidarity Act, ePrivacy, LED, EUCC

**Financial Services:**
MiCA, PSD2, MiFID II, MiFIR, AIFMD, SFDR, EU Taxonomy

**Healthcare & Medical:**
EHDS, MDR, IVDR

**Digital Services & Identity:**
eIDAS 2.0, Data Act, DSA, DMA, DGA, EECC

**Product Safety & Supply Chain:**
Chips Act, CRMA, GPSR, Machinery, PLD, RED, CSRD, CSDDD, CBAM, EUDR, CER

**Automotive:**
UN R155 (Vehicle Cybersecurity), UN R156 (Software Updates)

### 🛠️ Technical Improvements

- **Database Size:** Optimized to 19MB (compressed, pre-built)
- **FTS5 Search:** Enhanced query sanitization for special characters
- **Error Handling:** Robust PostgreSQL connection management
- **Rate Limiting:** Middleware for HTTP API protection
- **Test Coverage:** Comprehensive suite with edge cases

### 📚 Documentation

- **[Comprehensive Audit Report](docs/AUDIT_2026-02-12.md)** - Full coverage analysis
- **[Security Policy](SECURITY.md)** - Vulnerability reporting and best practices
- **[Database SSL/TLS Guide](docs/DATABASE_SSL.md)** - Production deployment security
- **[Coverage Details](docs/coverage.md)** - Regulation-by-regulation breakdown
- **[Use Cases](docs/use-cases.md)** - Industry-specific guidance

### ⚠️ Known Gaps (Not Blockers)

The 6% coverage gap consists entirely of delegated acts that **have not yet been published by EU authorities**:

- AI Act implementing acts (Q2-Q3 2026)
- NIS2 incident notification templates (2026)
- MiCA technical standards (throughout 2026)
- eIDAS 2.0 wallet specifications (mid-2026)

**Our daily monitoring will automatically detect and notify when these are published.**

### 🔮 Roadmap for 1.x

- **1.1.0** - AI Act implementing acts (when published)
- **1.2.0** - NIS2 incident templates (when published)
- **1.3.0** - MiCA technical standards (when published)
- **1.4.0** - eIDAS 2.0 wallet specs (when published)
- **1.x.0** - Amendment tracking and historical versions
- **1.x.0** - National transposition module (community-driven)

### 🙏 Acknowledgments

Built by [Ansvar Systems](https://ansvar.eu) in Stockholm, Sweden. Open-sourced under Apache 2.0 because navigating EU compliance shouldn't require a legal team.

Special thanks to the EUR-Lex team for maintaining the official EU legal database.

### 🚦 Getting Started

**Claude Desktop:**
```json
{
  "mcpServers": {
    "eu-regulations": {
      "command": "npx",
      "args": ["-y", "@ansvar/eu-regulations-mcp"]
    }
  }
}
```

Restart Claude Desktop. Done!

**npm:**
```bash
npm install -g @ansvar/eu-regulations-mcp
```

**More installation options:** [README.md](README.md#quick-start)

### 📞 Support

- **Issues:** [GitHub Issues](https://github.com/Ansvar-Systems/EU_compliance_MCP/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Ansvar-Systems/EU_compliance_MCP/discussions)
- **Email:** support@ansvar.eu
- **Website:** [ansvar.eu](https://ansvar.eu)

---

**Full Changelog:** [CHANGELOG.md](CHANGELOG.md)

**Related Projects:**
- [US Regulations MCP](https://github.com/Ansvar-Systems/US_Compliance_MCP) - HIPAA, CCPA, SOX, and more
- [Security Controls MCP](https://github.com/Ansvar-Systems/security-controls-mcp) - 1,451 controls across 28 frameworks
- [OT Security MCP](https://github.com/Ansvar-Systems/ot-security-mcp) - IEC 62443, NIST 800-82, MITRE ATT&CK for ICS
- [Automotive Cybersecurity MCP](https://github.com/Ansvar-Systems/Automotive-MCP) - UN R155/R156, ISO 21434
- [Sanctions MCP](https://github.com/Ansvar-Systems/Sanctions-MCP) - OFAC, EU, UN sanctions screening

---

🇪🇺 **Built with care in Stockholm, Sweden**
