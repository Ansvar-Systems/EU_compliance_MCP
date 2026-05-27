// Phase 5.B extension handlers — 5 EU-local tools registered alongside the
// chassis-standard surface via mcp-base v0.1.28 extensionHandlers API.
//
// These tools query EU-local tables (applicability_rules, control_mappings,
// evidence_requirements) that were intentionally preserved in the chassis
// build-db.ts migration so this Phase 5.B layer would be additive, not a
// second schema rework.

import type { ExtensionTool } from './types.js';
import { checkApplicabilityTool } from './applicability.js';
import { compareRequirementsTool } from './compare.js';
import { getEvidenceRequirementsTool } from './evidence.js';
import { mapControlsTool } from './map.js';
import { getRegulationGuideTool } from './regulation-guide.js';

export const euExtensionHandlers: Map<string, ExtensionTool> = new Map([
  [checkApplicabilityTool.definition.name, checkApplicabilityTool],
  [compareRequirementsTool.definition.name, compareRequirementsTool],
  [getEvidenceRequirementsTool.definition.name, getEvidenceRequirementsTool],
  [mapControlsTool.definition.name, mapControlsTool],
  [getRegulationGuideTool.definition.name, getRegulationGuideTool],
]);

export const EU_EXTENSION_TOOL_NAMES = Array.from(euExtensionHandlers.keys());
