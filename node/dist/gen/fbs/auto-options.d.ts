import * as flatbuffers from 'flatbuffers';
export declare class AutoOptions implements flatbuffers.IUnpackableObject<AutoOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): AutoOptions;
    static getRootAsAutoOptions(bb: flatbuffers.ByteBuffer, obj?: AutoOptions): AutoOptions;
    static getSizePrefixedRootAsAutoOptions(bb: flatbuffers.ByteBuffer, obj?: AutoOptions): AutoOptions;
    extremePointThreshold(): number;
    static startAutoOptions(builder: flatbuffers.Builder): void;
    static addExtremePointThreshold(builder: flatbuffers.Builder, extremePointThreshold: number): void;
    static endAutoOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createAutoOptions(builder: flatbuffers.Builder, extremePointThreshold: number): flatbuffers.Offset;
    unpack(): AutoOptionsT;
    unpackTo(_o: AutoOptionsT): void;
}
export declare class AutoOptionsT implements flatbuffers.IGeneratedObject {
    extremePointThreshold: number;
    constructor(extremePointThreshold?: number);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=auto-options.d.ts.map