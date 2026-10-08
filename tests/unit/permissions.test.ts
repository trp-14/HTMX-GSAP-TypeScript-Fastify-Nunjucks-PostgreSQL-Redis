import { describe, expect, it } from 'vitest';
import { permissionsFor, PERMISSIONS } from '../../src/auth/permissions.js';

describe('role permissions', () => {
  it('gives employees only self-service capabilities', () => {
    const p = permissionsFor(['EMPLOYEE']);
    expect(p.has('request:create')).toBe(true);
    expect(p.has('request:review')).toBe(false);
    expect(p.has('request:read:all')).toBe(false);
    expect(p.has('inventory:adjust')).toBe(false);
    expect(p.has('audit:read')).toBe(false);
  });

  it('lets managers review and assign but not process or administer', () => {
    const p = permissionsFor(['MANAGER']);
    expect(p.has('request:review')).toBe(true);
    expect(p.has('request:assign')).toBe(true);
    expect(p.has('request:process')).toBe(false);
    expect(p.has('user:manage')).toBe(false);
  });

  it('lets operations process requests and manage inventory', () => {
    const p = permissionsFor(['OPERATIONS']);
    expect(p.has('request:process')).toBe(true);
    expect(p.has('inventory:adjust')).toBe(true);
    expect(p.has('product:manage')).toBe(false);
  });

  it('gives admins every permission', () => {
    expect(permissionsFor(['ADMIN']).size).toBe(PERMISSIONS.length);
  });

  it('unions permissions for users with several roles', () => {
    const p = permissionsFor(['MANAGER', 'OPERATIONS']);
    expect(p.has('request:review') && p.has('request:process')).toBe(true);
  });
});
