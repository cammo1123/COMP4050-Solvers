import * as flatbuffers from 'flatbuffers';
import { BoxType, BoxTypeT } from '../solver/box-type.js';
export declare class SolveResponse implements flatbuffers.IUnpackableObject<SolveResponseT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): SolveResponse;
    static getRootAsSolveResponse(bb: flatbuffers.ByteBuffer, obj?: SolveResponse): SolveResponse;
    static getSizePrefixedRootAsSolveResponse(bb: flatbuffers.ByteBuffer, obj?: SolveResponse): SolveResponse;
    boxes(index: number, obj?: BoxType): BoxType | null;
    boxesLength(): number;
    static startSolveResponse(builder: flatbuffers.Builder): void;
    static addBoxes(builder: flatbuffers.Builder, boxesOffset: flatbuffers.Offset): void;
    static createBoxesVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startBoxesVector(builder: flatbuffers.Builder, numElems: number): void;
    static endSolveResponse(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createSolveResponse(builder: flatbuffers.Builder, boxesOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): SolveResponseT;
    unpackTo(_o: SolveResponseT): void;
}
export declare class SolveResponseT implements flatbuffers.IGeneratedObject {
    boxes: (BoxTypeT)[];
    constructor(boxes?: (BoxTypeT)[]);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-response.d.ts.map