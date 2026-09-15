import * as flatbuffers from 'flatbuffers';
export declare class StackBasedOptions implements flatbuffers.IUnpackableObject<StackBasedOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): StackBasedOptions;
    static getRootAsStackBasedOptions(bb: flatbuffers.ByteBuffer, obj?: StackBasedOptions): StackBasedOptions;
    static getSizePrefixedRootAsStackBasedOptions(bb: flatbuffers.ByteBuffer, obj?: StackBasedOptions): StackBasedOptions;
    static startStackBasedOptions(builder: flatbuffers.Builder): void;
    static endStackBasedOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createStackBasedOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): StackBasedOptionsT;
    unpackTo(_o: StackBasedOptionsT): void;
}
export declare class StackBasedOptionsT implements flatbuffers.IGeneratedObject {
    constructor();
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=stack-based-options.d.ts.map