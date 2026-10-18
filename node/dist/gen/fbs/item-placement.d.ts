import * as flatbuffers from 'flatbuffers';
import { ItemType, ItemTypeT } from '../fbs/item-type.js';
export declare class ItemPlacement implements flatbuffers.IUnpackableObject<ItemPlacementT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ItemPlacement;
    static getRootAsItemPlacement(bb: flatbuffers.ByteBuffer, obj?: ItemPlacement): ItemPlacement;
    static getSizePrefixedRootAsItemPlacement(bb: flatbuffers.ByteBuffer, obj?: ItemPlacement): ItemPlacement;
    x(): number;
    y(): number;
    z(): number;
    item(obj?: ItemType): ItemType | null;
    static startItemPlacement(builder: flatbuffers.Builder): void;
    static addX(builder: flatbuffers.Builder, x: number): void;
    static addY(builder: flatbuffers.Builder, y: number): void;
    static addZ(builder: flatbuffers.Builder, z: number): void;
    static addItem(builder: flatbuffers.Builder, itemOffset: flatbuffers.Offset): void;
    static endItemPlacement(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): ItemPlacementT;
    unpackTo(_o: ItemPlacementT): void;
}
export declare class ItemPlacementT implements flatbuffers.IGeneratedObject {
    x: number;
    y: number;
    z: number;
    item: ItemTypeT | null;
    constructor(x?: number, y?: number, z?: number, item?: ItemTypeT | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=item-placement.d.ts.map