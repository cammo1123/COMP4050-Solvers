import * as flatbuffers from 'flatbuffers';
export declare class InfoRequest implements flatbuffers.IUnpackableObject<InfoRequestT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): InfoRequest;
    static getRootAsInfoRequest(bb: flatbuffers.ByteBuffer, obj?: InfoRequest): InfoRequest;
    static getSizePrefixedRootAsInfoRequest(bb: flatbuffers.ByteBuffer, obj?: InfoRequest): InfoRequest;
    static startInfoRequest(builder: flatbuffers.Builder): void;
    static endInfoRequest(builder: flatbuffers.Builder): flatbuffers.Offset;
    static finishInfoRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static finishSizePrefixedInfoRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static createInfoRequest(builder: flatbuffers.Builder): flatbuffers.Offset;
    unpack(): InfoRequestT;
    unpackTo(_o: InfoRequestT): void;
}
export declare class InfoRequestT implements flatbuffers.IGeneratedObject {
    constructor();
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=info-request.d.ts.map