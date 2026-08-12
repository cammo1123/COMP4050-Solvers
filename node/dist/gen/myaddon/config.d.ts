import * as flatbuffers from 'flatbuffers';
export declare class Config implements flatbuffers.IUnpackableObject<ConfigT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): Config;
    static getRootAsConfig(bb: flatbuffers.ByteBuffer, obj?: Config): Config;
    static getSizePrefixedRootAsConfig(bb: flatbuffers.ByteBuffer, obj?: Config): Config;
    keep(): boolean;
    static startConfig(builder: flatbuffers.Builder): void;
    static addKeep(builder: flatbuffers.Builder, keep: boolean): void;
    static endConfig(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createConfig(builder: flatbuffers.Builder, keep: boolean): flatbuffers.Offset;
    unpack(): ConfigT;
    unpackTo(_o: ConfigT): void;
}
export declare class ConfigT implements flatbuffers.IGeneratedObject {
    keep: boolean;
    constructor(keep?: boolean);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=config.d.ts.map