import * as flatbuffers from 'flatbuffers';
import { BoxType, BoxTypeT } from '../solver/box-type.js';
import { ItemType, ItemTypeT } from '../solver/item-type.js';
export declare class SolveRequest implements flatbuffers.IUnpackableObject<SolveRequestT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): SolveRequest;
    static getRootAsSolveRequest(bb: flatbuffers.ByteBuffer, obj?: SolveRequest): SolveRequest;
    static getSizePrefixedRootAsSolveRequest(bb: flatbuffers.ByteBuffer, obj?: SolveRequest): SolveRequest;
    boxes(index: number, obj?: BoxType): BoxType | null;
    boxesLength(): number;
    items(index: number, obj?: ItemType): ItemType | null;
    itemsLength(): number;
    static startSolveRequest(builder: flatbuffers.Builder): void;
    static addBoxes(builder: flatbuffers.Builder, boxesOffset: flatbuffers.Offset): void;
    static createBoxesVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startBoxesVector(builder: flatbuffers.Builder, numElems: number): void;
    static addItems(builder: flatbuffers.Builder, itemsOffset: flatbuffers.Offset): void;
    static createItemsVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startItemsVector(builder: flatbuffers.Builder, numElems: number): void;
    static endSolveRequest(builder: flatbuffers.Builder): flatbuffers.Offset;
    static finishSolveRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static finishSizePrefixedSolveRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static createSolveRequest(builder: flatbuffers.Builder, boxesOffset: flatbuffers.Offset, itemsOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): SolveRequestT;
    unpackTo(_o: SolveRequestT): void;
}
export declare class SolveRequestT implements flatbuffers.IGeneratedObject {
    boxes: (BoxTypeT)[];
    items: (ItemTypeT)[];
    constructor(boxes?: (BoxTypeT)[], items?: (ItemTypeT)[]);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-request.d.ts.map