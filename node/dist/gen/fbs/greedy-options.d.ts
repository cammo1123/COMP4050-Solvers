import * as flatbuffers from 'flatbuffers';
export declare class GreedyOptions implements flatbuffers.IUnpackableObject<GreedyOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): GreedyOptions;
    static getRootAsGreedyOptions(bb: flatbuffers.ByteBuffer, obj?: GreedyOptions): GreedyOptions;
    static getSizePrefixedRootAsGreedyOptions(bb: flatbuffers.ByteBuffer, obj?: GreedyOptions): GreedyOptions;
    static startGreedyOptions(builder: flatbuffers.Builder): void;
    static endGreedyOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createGreedyOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): GreedyOptionsT;
    unpackTo(_o: GreedyOptionsT): void;
}
export declare class GreedyOptionsT implements flatbuffers.IGeneratedObject {
    constructor();
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=greedy-options.d.ts.map