import * as flatbuffers from 'flatbuffers';
export declare class ItemPlacement implements flatbuffers.IUnpackableObject<ItemPlacementT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ItemPlacement;
    static getRootAsItemPlacement(bb: flatbuffers.ByteBuffer, obj?: ItemPlacement): ItemPlacement;
    static getSizePrefixedRootAsItemPlacement(bb: flatbuffers.ByteBuffer, obj?: ItemPlacement): ItemPlacement;
    itemCode(): string | null;
    itemCode(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    itemReference(): string | null;
    itemReference(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    x(): number;
    y(): number;
    z(): number;
    width(): number;
    length(): number;
    depth(): number;
    static startItemPlacement(builder: flatbuffers.Builder): void;
    static addItemCode(builder: flatbuffers.Builder, itemCodeOffset: flatbuffers.Offset): void;
    static addItemReference(builder: flatbuffers.Builder, itemReferenceOffset: flatbuffers.Offset): void;
    static addX(builder: flatbuffers.Builder, x: number): void;
    static addY(builder: flatbuffers.Builder, y: number): void;
    static addZ(builder: flatbuffers.Builder, z: number): void;
    static addWidth(builder: flatbuffers.Builder, width: number): void;
    static addLength(builder: flatbuffers.Builder, length: number): void;
    static addDepth(builder: flatbuffers.Builder, depth: number): void;
    static endItemPlacement(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createItemPlacement(builder: flatbuffers.Builder, itemCodeOffset: flatbuffers.Offset, itemReferenceOffset: flatbuffers.Offset, x: number, y: number, z: number, width: number, length: number, depth: number): flatbuffers.Offset;
    unpack(): ItemPlacementT;
    unpackTo(_o: ItemPlacementT): void;
}
export declare class ItemPlacementT implements flatbuffers.IGeneratedObject {
    itemCode: string | Uint8Array | null;
    itemReference: string | Uint8Array | null;
    x: number;
    y: number;
    z: number;
    width: number;
    length: number;
    depth: number;
    constructor(itemCode?: string | Uint8Array | null, itemReference?: string | Uint8Array | null, x?: number, y?: number, z?: number, width?: number, length?: number, depth?: number);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=item-placement.d.ts.map