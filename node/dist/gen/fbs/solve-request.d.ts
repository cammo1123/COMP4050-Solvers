import * as flatbuffers from 'flatbuffers';
import { BoxType, BoxTypeT } from '../fbs/box-type.js';
import { ItemType, ItemTypeT } from '../fbs/item-type.js';
import { SolveOptions, SolveOptionsT } from '../fbs/solve-options.js';
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
    options(obj?: SolveOptions): SolveOptions | null;
    static startSolveRequest(builder: flatbuffers.Builder): void;
    static addBoxes(builder: flatbuffers.Builder, boxesOffset: flatbuffers.Offset): void;
    static createBoxesVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startBoxesVector(builder: flatbuffers.Builder, numElems: number): void;
    static addItems(builder: flatbuffers.Builder, itemsOffset: flatbuffers.Offset): void;
    static createItemsVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startItemsVector(builder: flatbuffers.Builder, numElems: number): void;
    static addOptions(builder: flatbuffers.Builder, optionsOffset: flatbuffers.Offset): void;
    static endSolveRequest(builder: flatbuffers.Builder): flatbuffers.Offset;
    static finishSolveRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static finishSizePrefixedSolveRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    unpack(): SolveRequestT;
    unpackTo(_o: SolveRequestT): void;
}
export declare class SolveRequestT implements flatbuffers.IGeneratedObject {
    boxes: (BoxTypeT)[];
    items: (ItemTypeT)[];
    options: SolveOptionsT | null;
    constructor(boxes?: (BoxTypeT)[], items?: (ItemTypeT)[], options?: SolveOptionsT | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-request.d.ts.map