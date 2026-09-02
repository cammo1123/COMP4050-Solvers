import * as flatbuffers from 'flatbuffers';
export declare class ExtremePointOptions implements flatbuffers.IUnpackableObject<ExtremePointOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ExtremePointOptions;
    static getRootAsExtremePointOptions(bb: flatbuffers.ByteBuffer, obj?: ExtremePointOptions): ExtremePointOptions;
    static getSizePrefixedRootAsExtremePointOptions(bb: flatbuffers.ByteBuffer, obj?: ExtremePointOptions): ExtremePointOptions;
    static startExtremePointOptions(builder: flatbuffers.Builder): void;
    static endExtremePointOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createExtremePointOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): ExtremePointOptionsT;
    unpackTo(_o: ExtremePointOptionsT): void;
}
export declare class ExtremePointOptionsT implements flatbuffers.IGeneratedObject {
    constructor();
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=extreme-point-options.d.ts.map