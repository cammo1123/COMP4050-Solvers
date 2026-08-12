import * as flatbuffers from 'flatbuffers';
import { Data, DataT } from '../myaddon/data.js';
export declare class DoubleValueResponse implements flatbuffers.IUnpackableObject<DoubleValueResponseT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): DoubleValueResponse;
    static getRootAsDoubleValueResponse(bb: flatbuffers.ByteBuffer, obj?: DoubleValueResponse): DoubleValueResponse;
    static getSizePrefixedRootAsDoubleValueResponse(bb: flatbuffers.ByteBuffer, obj?: DoubleValueResponse): DoubleValueResponse;
    data(index: number, obj?: Data): Data | null;
    dataLength(): number;
    static startDoubleValueResponse(builder: flatbuffers.Builder): void;
    static addData(builder: flatbuffers.Builder, dataOffset: flatbuffers.Offset): void;
    static createDataVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startDataVector(builder: flatbuffers.Builder, numElems: number): void;
    static endDoubleValueResponse(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createDoubleValueResponse(builder: flatbuffers.Builder, dataOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): DoubleValueResponseT;
    unpackTo(_o: DoubleValueResponseT): void;
}
export declare class DoubleValueResponseT implements flatbuffers.IGeneratedObject {
    data: (DataT)[];
    constructor(data?: (DataT)[]);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=double-value-response.d.ts.map