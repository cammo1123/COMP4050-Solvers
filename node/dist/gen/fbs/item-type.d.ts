import * as flatbuffers from 'flatbuffers';
import { PlacementConstraint, PlacementConstraintT } from '../fbs/placement-constraint.js';
export declare class ItemType implements flatbuffers.IUnpackableObject<ItemTypeT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ItemType;
    static getRootAsItemType(bb: flatbuffers.ByteBuffer, obj?: ItemType): ItemType;
    static getSizePrefixedRootAsItemType(bb: flatbuffers.ByteBuffer, obj?: ItemType): ItemType;
    itemCode(): string | null;
    itemCode(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    itemReference(): string | null;
    itemReference(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    width(): number;
    length(): number;
    depth(): number;
    weight(): number;
    boxGroup(): string | null;
    boxGroup(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    rotationPolicy(): number | null;
    linkedGroup(): string | null;
    linkedGroup(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    constraint(obj?: PlacementConstraint): PlacementConstraint | null;
    static startItemType(builder: flatbuffers.Builder): void;
    static addItemCode(builder: flatbuffers.Builder, itemCodeOffset: flatbuffers.Offset): void;
    static addItemReference(builder: flatbuffers.Builder, itemReferenceOffset: flatbuffers.Offset): void;
    static addWidth(builder: flatbuffers.Builder, width: number): void;
    static addLength(builder: flatbuffers.Builder, length: number): void;
    static addDepth(builder: flatbuffers.Builder, depth: number): void;
    static addWeight(builder: flatbuffers.Builder, weight: number): void;
    static addBoxGroup(builder: flatbuffers.Builder, boxGroupOffset: flatbuffers.Offset): void;
    static addRotationPolicy(builder: flatbuffers.Builder, rotationPolicy: number): void;
    static addLinkedGroup(builder: flatbuffers.Builder, linkedGroupOffset: flatbuffers.Offset): void;
    static addConstraint(builder: flatbuffers.Builder, constraintOffset: flatbuffers.Offset): void;
    static endItemType(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): ItemTypeT;
    unpackTo(_o: ItemTypeT): void;
}
export declare class ItemTypeT implements flatbuffers.IGeneratedObject {
    itemCode: string | Uint8Array | null;
    itemReference: string | Uint8Array | null;
    width: number;
    length: number;
    depth: number;
    weight: number;
    boxGroup: string | Uint8Array | null;
    rotationPolicy: number | null;
    linkedGroup: string | Uint8Array | null;
    constraint: PlacementConstraintT | null;
    constructor(itemCode?: string | Uint8Array | null, itemReference?: string | Uint8Array | null, width?: number, length?: number, depth?: number, weight?: number, boxGroup?: string | Uint8Array | null, rotationPolicy?: number | null, linkedGroup?: string | Uint8Array | null, constraint?: PlacementConstraintT | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=item-type.d.ts.map