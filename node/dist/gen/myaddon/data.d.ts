import * as flatbuffers from 'flatbuffers';
export declare class Data implements flatbuffers.IUnpackableObject<DataT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): Data;
    static getRootAsData(bb: flatbuffers.ByteBuffer, obj?: Data): Data;
    static getSizePrefixedRootAsData(bb: flatbuffers.ByteBuffer, obj?: Data): Data;
    id(): number;
    static startData(builder: flatbuffers.Builder): void;
    static addId(builder: flatbuffers.Builder, id: number): void;
    static endData(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createData(builder: flatbuffers.Builder, id: number): flatbuffers.Offset;
    unpack(): DataT;
    unpackTo(_o: DataT): void;
}
export declare class DataT implements flatbuffers.IGeneratedObject {
    id: number;
    constructor(id?: number);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=data.d.ts.map