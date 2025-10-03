import { toRawJSON, toCompactJSON, toMongoQuery, toMongoInsert } from '../CopyFormats';

describe('CopyFormats hardened P0', () => {
  const doc = { _id: 'abc123', z: 1, a: 2 };

  it('raw json pretty and stable key order', () => {
    const s = toRawJSON(doc);
    expect(s.indexOf('"a"')).toBeLessThan(s.indexOf('"z"'));
  });

  it('compact json is minified and ordered', () => {
    const s = toCompactJSON(doc);
    expect(s).toBe('{"_id":"abc123","a":2,"z":1}');
  });

  it('preserves arrays correctly (not as objects)', () => {
    const docWithArray = { _id: 'x', tags: ['a', 'b', 'c'], nested: [{ id: 1 }, { id: 2 }] };
    const json = toRawJSON(docWithArray);
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.tags).toEqual(['a', 'b', 'c']);
    expect(Array.isArray(parsed.nested)).toBe(true);
    expect(parsed.nested[0].id).toBe(1);
  });

  it('mongo query generates useful field queries', () => {
    const q = toMongoQuery('users', doc);
    // Should show useful fields (z, a) AND _id
    expect(q).toContain('db.users.findOne({ "z": 1 })');
    expect(q).toContain('db.users.findOne({ "a": 2 })');
    expect(q).toContain('db.users.findOne({ _id: "abc123" })');

    const ejsonDoc = { _id: { $oid: '507f1f77bcf86cd799439011' } } as any;
    const q2 = toMongoQuery('users', ejsonDoc);
    expect(q2.startsWith('// WARNING:')).toBe(true);
    expect(q2).toContain('db.users.findOne({ _id: {"$oid":"507f1f77bcf86cd799439011"} })');
  });

  it('mongo insert warns on ejson-like content', () => {
    const d = { _id: 'abc', createdAt: new Date() } as any;
    const ins = toMongoInsert('users', d);
    expect(ins.startsWith('// WARNING:')).toBe(true);
    expect(ins).toContain('db.users.insertOne(');
  });

  it('circulars serialize to a valid JSON string token', () => {
    const a: any = { _id: 'x' };
    a.self = a;
    const pretty = toRawJSON(a);
    const compact = toCompactJSON(a);
    expect(() => JSON.parse(pretty)).not.toThrow();
    expect(() => JSON.parse(compact)).not.toThrow();
    expect(pretty).toContain('__METEOR_DEVTOOLS_CIRCULAR_REFERENCE__');
  });
});
