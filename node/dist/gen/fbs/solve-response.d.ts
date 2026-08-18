import * as flatbuffers from 'flatbuffers';
import { BoxResult, BoxResultT } from '../fbs/box-result.js';
import { ItemType, ItemTypeT } from '../fbs/item-type.js';
export declare class SolveResponse implements flatbuffers.IUnpackableObject<SolveResponseT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): SolveResponse;
    static getRootAsSolveResponse(bb: flatbuffers.ByteBuffer, obj?: SolveResponse): SolveResponse;
    static getSizePrefixedRootAsSolveResponse(bb: flatbuffers.ByteBuffer, obj?: SolveResponse): SolveResponse;
    results(index: number, obj?: BoxResult): BoxResult | null;
    resultsLength(): number;
    failed(index: number, obj?: ItemType): ItemType | null;
    failedLength(): number;
    static startSolveResponse(builder: flatbuffers.Builder): void;
    static addResults(builder: flatbuffers.Builder, resultsOffset: flatbuffers.Offset): void;
    static createResultsVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startResultsVector(builder: flatbuffers.Builder, numElems: number): void;
    static addFailed(builder: flatbuffers.Builder, failedOffset: flatbuffers.Offset): void;
    static createFailedVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startFailedVector(builder: flatbuffers.Builder, numElems: number): void;
    static endSolveResponse(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createSolveResponse(builder: flatbuffers.Builder, resultsOffset: flatbuffers.Offset, failedOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): SolveResponseT;
    unpackTo(_o: SolveResponseT): void;
}
export declare class SolveResponseT implements flatbuffers.IGeneratedObject {
    results: (BoxResultT)[];
    failed: (ItemTypeT)[];
    constructor(results?: (BoxResultT)[], failed?: (ItemTypeT)[]);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-response.d.ts.map