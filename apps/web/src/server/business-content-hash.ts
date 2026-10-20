import { createHash } from 'node:crypto';

// Canonical business payload fields are defined in DB schema design §5.
// This module does not include revision, timestamps, IDs or sync metadata.
type BusinessKind = 'BOX' | 'ITEM' | 'BOX_LOCATION';
type RecordData = Record<string, unknown>;
const FIELDS: Record<BusinessKind, readonly string[]> = {
  BOX: ['code', 'name', 'locationId', 'parentBoxId', 'tags', 'note', 'thumbs', 'meta', 'deleted'],
  ITEM: ['boxId', 'name', 'tags', 'note', 'thumbs', 'meta', 'deleted'],
  BOX_LOCATION: ['name', 'note', 'thumbs', 'meta', 'deleted'],
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as RecordData)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

function normalizedString(value: unknown, required: boolean): string | null {
  if (value == null) {
    if (required) throw new Error('Required business string is missing');
    return null;
  }
  if (typeof value !== 'string') throw new Error('Expected business string');
  const result = value.trim().normalize('NFC');
  if (required && !result) throw new Error('Required business string is empty');
  return result || null;
}

export function canonicalBusinessPayload(kind: BusinessKind, record: RecordData): RecordData {
  const out: RecordData = {};
  for (const field of FIELDS[kind]) {
    const value = record[field];
    if (field === 'deleted') {
      out[field] = value === true || record.deletedAt != null;
    } else if (field === 'tags') {
      if (!Array.isArray(value)) throw new Error('Expected tags array');
      out[field] = [...new Set(value.map((v) => normalizedString(v, false)).filter((v): v is string => v !== null))].sort();
    } else if (field === 'thumbs') {
      if (!Array.isArray(value)) throw new Error('Expected thumbs array');
      out[field] = stable(value);
    } else if (field === 'meta') {
      out[field] = value == null ? null : stable(value);
    } else if (['code', 'name'].includes(field)) {
      out[field] = normalizedString(value, true);
    } else {
      out[field] = normalizedString(value, false);
    }
  }
  return out;
}

export function businessContentHash(kind: BusinessKind, record: RecordData): string {
  return createHash('sha256').update(JSON.stringify(canonicalBusinessPayload(kind, record)), 'utf8').digest('hex');
}
