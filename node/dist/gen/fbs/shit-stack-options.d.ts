import * as flatbuffers from 'flatbuffers';
export declare class ShitStackOptions implements flatbuffers.IUnpackableObject<ShitStackOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ShitStackOptions;
    static getRootAsShitStackOptions(bb: flatbuffers.ByteBuffer, obj?: ShitStackOptions): ShitStackOptions;
    static getSizePrefixedRootAsShitStackOptions(bb: flatbuffers.ByteBuffer, obj?: ShitStackOptions): ShitStackOptions;
    static startShitStackOptions(builder: flatbuffers.Builder): void;
    static endShitStackOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createShitStackOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): ShitStackOptionsT;
    unpackTo(_o: ShitStackOptionsT): void;
}
export declare class ShitStackOptionsT implements flatbuffers.IGeneratedObject {
    constructor();
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=shit-stack-options.d.ts.map