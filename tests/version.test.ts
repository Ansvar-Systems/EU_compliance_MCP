import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Version', () => {
  it('should be at least 0.4.0', () => {
    const version = packageJson.version;
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(4); // 0.4.0+
  });
});
