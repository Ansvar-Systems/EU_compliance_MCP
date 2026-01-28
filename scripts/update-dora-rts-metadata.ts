#!/usr/bin/env node
/**
 * Update metadata for DORA RTS/ITS JSON files
 */
import * as fs from 'fs';
import * as path from 'path';

interface RegulationMetadata {
  id: string;
  full_name: string;
  effective_date: string;
}

const DORA_RTS_ITS_METADATA: Record<string, RegulationMetadata> = {
  '32024R1774': {
    id: 'DORA_RTS_ICT_RISK',
    full_name: 'Commission Delegated Regulation (EU) 2024/1774 - ICT Risk Management Tools, Methods, Processes and Simplified Framework',
    effective_date: '2025-01-17',
  },
  '32024R1772': {
    id: 'DORA_RTS_INCIDENT_CLASS',
    full_name: 'Commission Delegated Regulation (EU) 2024/1772 - Classification of ICT-Related Incidents and Cyber Threats',
    effective_date: '2025-01-17',
  },
  '32024R1773': {
    id: 'DORA_RTS_ICT_SERVICES',
    full_name: 'Commission Delegated Regulation (EU) 2024/1773 - Policy on ICT Services Supporting Critical or Important Functions',
    effective_date: '2025-01-17',
  },
  '32024R2956': {
    id: 'DORA_ITS_REGISTER',
    full_name: 'Commission Implementing Regulation (EU) 2024/2956 - Standard Templates for Register of Information',
    effective_date: '2025-01-17',
  },
  '32024R1502': {
    id: 'DORA_RTS_CRITICAL_PROVIDER',
    full_name: 'Commission Delegated Regulation (EU) 2024/1502 - Criteria for Designation of Critical ICT Third-Party Service Providers',
    effective_date: '2025-01-17',
  },
  '32024R1505': {
    id: 'DORA_RTS_OVERSIGHT_FEES',
    full_name: 'Commission Delegated Regulation (EU) 2024/1505 - Oversight Fees for Critical ICT Third-Party Service Providers',
    effective_date: '2025-01-17',
  },
  '32025R0295': {
    id: 'DORA_RTS_OVERSIGHT',
    full_name: 'Commission Delegated Regulation (EU) 2025/295 - Harmonization of Oversight Activities Conditions',
    effective_date: '2025-01-17',
  },
  '32025R0301': {
    id: 'DORA_RTS_INCIDENT_REPORTING',
    full_name: 'Commission Delegated Regulation (EU) 2025/301 - Content and Time Limits for Incident Reporting',
    effective_date: '2025-01-17',
  },
  '32025R0302': {
    id: 'DORA_ITS_INCIDENT_FORMS',
    full_name: 'Commission Implementing Regulation (EU) 2025/302 - Standard Forms and Templates for Incident Reporting',
    effective_date: '2025-01-17',
  },
  '32025R1190': {
    id: 'DORA_RTS_TLPT',
    full_name: 'Commission Delegated Regulation (EU) 2025/1190 - Threat-Led Penetration Testing (TLPT)',
    effective_date: '2025-01-17',
  },
};

const FILE_MAPPING: Record<string, string> = {
  '32024R1774': 'data/seed/dora-rts-ict-risk.json',
  '32024R1772': 'data/seed/dora-rts-incident-classification.json',
  '32024R1773': 'data/seed/dora-rts-ict-services-policy.json',
  '32024R2956': 'data/seed/dora-its-register-templates.json',
  '32024R1502': 'data/seed/dora-rts-critical-provider-designation.json',
  '32024R1505': 'data/seed/dora-rts-oversight-fees.json',
  '32025R0295': 'data/seed/dora-rts-oversight-harmonization.json',
  '32025R0301': 'data/seed/dora-rts-incident-reporting.json',
  '32025R0302': 'data/seed/dora-its-incident-forms.json',
  '32025R1190': 'data/seed/dora-rts-tlpt.json',
};

function updateRegulationMetadata(celex: string, filePath: string): void {
  const metadata = DORA_RTS_ITS_METADATA[celex];
  if (!metadata) {
    console.error(`No metadata found for CELEX ${celex}`);
    return;
  }

  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  // Update metadata
  data.id = metadata.id;
  data.full_name = metadata.full_name;
  data.effective_date = metadata.effective_date;

  // Write back
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`✅ Updated ${celex} → ${metadata.id} (${filePath})`);
}

// Main
console.log('Updating DORA RTS/ITS metadata...\n');

for (const [celex, filePath] of Object.entries(FILE_MAPPING)) {
  updateRegulationMetadata(celex, filePath);
}

console.log('\n✅ All metadata updated successfully!');
