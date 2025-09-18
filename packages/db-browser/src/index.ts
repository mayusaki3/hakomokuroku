import Dexie, { Table } from 'dexie';

export interface Box { id: string; name: string; location?: string; tags?: string[]; coverImageId?: string; code: string; createdAt: number; updatedAt: number; }
export interface Item { id: string; boxId: string; name: string; quantity?: number; tags?: string[]; features?: string; note?: string; imageIds?: string[]; createdAt: number; updatedAt: number; }
export interface ImageRec { id: string; owner?: string; boxId?: string; itemId?: string; dataUrl: string; w: number; h: number; exif?: any; createdAt: number; }

export class HKDB extends Dexie {
    boxes!: Table<Box, string>;
    items!: Table<Item, string>;
    images!: Table<ImageRec, string>;
    constructor() {
        super('hakomokuroku');
        this.version(1).stores({
            boxes: '&id, name, location, code, updatedAt',
            items: '&id, boxId, name, updatedAt',
            images: '&id, boxId, itemId, createdAt'
        });
    }
}
export const db = new HKDB();
