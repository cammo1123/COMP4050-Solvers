import * as flatbuffers from 'flatbuffers';
import { ItemPlacement, ItemPlacementT } from '../fbs/item-placement.js';
export declare class BoxResult implements flatbuffers.IUnpackableObject<BoxResultT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): BoxResult;
    static getRootAsBoxResult(bb: flatbuffers.ByteBuffer, obj?: BoxResult): BoxResult;
    static getSizePrefixedRootAsBoxResult(bb: flatbuffers.ByteBuffer, obj?: BoxResult): BoxResult;
    boxReference(): string | null;
    boxReference(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    placements(index: number, obj?: ItemPlacement): ItemPlacement | null;
    placementsLength(): number;
    totalWeight(): number | null;
    utilization(): number | null;
    static startBoxResult(builder: flatbuffers.Builder): void;
    static addBoxReference(builder: flatbuffers.Builder, boxReferenceOffset: flatbuffers.Offset): void;
    static addPlacements(builder: flatbuffers.Builder, placementsOffset: flatbuffers.Offset): void;
    static createPlacementsVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startPlacementsVector(builder: flatbuffers.Builder, numElems: number): void;
    static addTotalWeight(builder: flatbuffers.Builder, totalWeight: number): void;
    static addUtilization(builder: flatbuffers.Builder, utilization: number): void;
    static endBoxResult(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createBoxResult(builder: flatbuffers.Builder, boxReferenceOffset: flatbuffers.Offset, placementsOffset: flatbuffers.Offset, totalWeight: number | null, utilization: number | null): flatbuffers.Offset;
    unpack(): BoxResultT;
    unpackTo(_o: BoxResultT): void;
}
export declare class BoxResultT implements flatbuffers.IGeneratedObject {
    boxReference: string | Uint8Array | null;
    placements: (ItemPlacementT)[];
    totalWeight: number | null;
    utilization: number | null;
    constructor(boxReference?: string | Uint8Array | null, placements?: (ItemPlacementT)[], totalWeight?: number | null, utilization?: number | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=box-result.d.ts.map