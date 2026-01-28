#!/usr/bin/env tsx
/**
 * Sync versions across all workspace packages and manifests
 *
 * Usage:
 *   npm run sync-versions
 *   npx tsx scripts/sync-versions.ts
 *
 * This script:
 * 1. Reads version from root package.json (source of truth)
 * 2. Updates all workspace package.json files
 * 3. Updates Teams manifest version
 * 4. Validates consistency
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

interface TeamsManifest {
  version: string;
  [key: string]: any;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function readJson<T>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

function writeJson(path: string, data: any): void {
  const content = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(path, content, 'utf-8');
}

async function main() {
  console.log('🔄 Syncing versions across workspace...\n');

  // 1. Read root version (source of truth)
  const rootPkgPath = join(ROOT_DIR, 'package.json');
  const rootPkg = readJson<PackageJson>(rootPkgPath);
  const targetVersion = rootPkg.version;

  console.log(`📦 Root version: ${targetVersion}`);
  console.log(`   Package: ${rootPkg.name}\n`);

  // 2. Find all workspace packages
  const workspacePackages = await glob('packages/*/package.json', { cwd: ROOT_DIR });

  let updatedCount = 0;
  let alreadyCurrentCount = 0;

  console.log('📝 Updating workspace packages:');

  for (const pkgPath of workspacePackages) {
    const fullPath = join(ROOT_DIR, pkgPath);
    const pkg = readJson<PackageJson>(fullPath);

    if (pkg.version !== targetVersion) {
      const oldVersion = pkg.version;
      pkg.version = targetVersion;
      writeJson(fullPath, pkg);
      console.log(`   ✅ ${pkg.name}: ${oldVersion} → ${targetVersion}`);
      updatedCount++;
    } else {
      console.log(`   ⏭️  ${pkg.name}: ${targetVersion} (already current)`);
      alreadyCurrentCount++;
    }
  }

  // 3. Update Teams manifest
  const teamsManifestPath = join(ROOT_DIR, 'packages/teams-extension/manifest.json');
  const teamsManifest = readJson<TeamsManifest>(teamsManifestPath);

  console.log('\n📱 Updating Teams manifest:');

  if (teamsManifest.version !== targetVersion) {
    const oldVersion = teamsManifest.version;
    teamsManifest.version = targetVersion;
    writeJson(teamsManifestPath, teamsManifest);
    console.log(`   ✅ Teams manifest: ${oldVersion} → ${targetVersion}`);
    updatedCount++;
  } else {
    console.log(`   ⏭️  Teams manifest: ${targetVersion} (already current)`);
    alreadyCurrentCount++;
  }

  // 4. Validation
  console.log('\n🔍 Validating consistency...');

  const allPackages = await glob('{package.json,packages/*/package.json}', { cwd: ROOT_DIR });
  let inconsistencies = 0;

  for (const pkgPath of allPackages) {
    const fullPath = join(ROOT_DIR, pkgPath);
    const pkg = readJson<PackageJson>(fullPath);

    if (pkg.version !== targetVersion) {
      console.log(`   ❌ ${pkg.name}: ${pkg.version} (expected ${targetVersion})`);
      inconsistencies++;
    }
  }

  if (teamsManifest.version !== targetVersion) {
    console.log(`   ❌ Teams manifest: ${teamsManifest.version} (expected ${targetVersion})`);
    inconsistencies++;
  }

  // 5. Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Target version: ${targetVersion}`);
  console.log(`   Updated: ${updatedCount} files`);
  console.log(`   Already current: ${alreadyCurrentCount} files`);
  console.log(`   Inconsistencies: ${inconsistencies}`);
  console.log('='.repeat(50));

  if (inconsistencies > 0) {
    console.error('\n❌ Version sync failed - inconsistencies found!');
    process.exit(1);
  }

  if (updatedCount > 0) {
    console.log('\n✅ Version sync complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Review changes: git diff');
    console.log('   2. Test builds: pnpm -r build && pnpm test');
    console.log('   3. Commit: git add . && git commit -m "chore: sync versions to ' + targetVersion + '"');
  } else {
    console.log('\n✅ All versions already synchronized!');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
