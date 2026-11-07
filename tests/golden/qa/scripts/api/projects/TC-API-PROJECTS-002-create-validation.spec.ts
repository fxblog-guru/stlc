// Golden: table-driven variants of ONE intent ("create refuses an invalid body with the
// documented error"). Equivalence classes and boundaries are rows; each row is its own test, so
// they run in parallel and fail independently. Every value is copied from the case's matrix.
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';
import type { ApiResponse } from '../../shared/fixtures';

type Row = { id: string; technique: 'EP' | 'BVA' | 'error-guess'; label: string; body: (name: string) => unknown; status: number; field?: string; code?: string };

const ROWS: readonly Row[] = [
  { id: 'a', technique: 'BVA', label: 'name length 0 (min − 1)', body: () => ({ name: '' }), status: 422, field: 'name', code: 'length' },
  { id: 'b', technique: 'BVA', label: 'name length 1 (min)', body: () => ({ name: 'Q' }), status: 201 },
  { id: 'c', technique: 'BVA', label: 'name length 80 (max)', body: (n) => ({ name: n.padEnd(80, 'x').slice(0, 80) }), status: 201 },
  { id: 'd', technique: 'BVA', label: 'name length 81 (max + 1)', body: (n) => ({ name: n.padEnd(81, 'x').slice(0, 81) }), status: 422, field: 'name', code: 'length' },
  { id: 'e', technique: 'EP', label: 'name missing', body: () => ({ description: 'x' }), status: 422, field: 'name', code: 'required' },
  { id: 'f', technique: 'EP', label: 'name is a number', body: () => ({ name: 42 }), status: 422, field: 'name', code: 'required' },
  { id: 'g', technique: 'EP', label: 'unknown property', body: (n) => ({ name: n, color: 'red' }), status: 422, field: 'color', code: 'unknown' },
  { id: 'h', technique: 'error-guess', label: 'body is an array', body: () => [], status: 400 },
];

for (const row of ROWS) {
  test(`TC-API-PROJECTS-002 — row ${row.id}: ${row.label} → ${row.status}`, caseMeta({
    id: 'TC-API-PROJECTS-002', type: 'api', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
    // names are unique product-wide; a 1-character name cannot carry the run prefix, so the row
    // that creates one takes a lock instead of colliding with itself on another worker or shard
    lock: row.id === 'b' ? ['projects:short-name'] : undefined,
  }), async ({ projectsAs, projectsFactory, cleanup }) => {
    const owner = await projectsAs('owner');
    const res: ApiResponse<{ id: string; errors?: { field: string; code: string }[] }> = await owner.create(row.body(projectsFactory.build().name as string));
    if (res.status === 201) cleanup.add('project', () => owner.remove(res.body.id)); // eslint-disable-line playwright/no-conditional-in-test -- cleanup only, never an assertion
    await expectSchema(res, 'createProject', row.status);
    expect(res.body.errors ?? []).toEqual(row.field ? [expect.objectContaining({ field: row.field, code: row.code })] : []);
  });
}
