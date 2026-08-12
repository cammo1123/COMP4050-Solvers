import * as flatbuffers from 'flatbuffers';
import { Config, ConfigT } from '../myaddon/config.js';
import { Data, DataT } from '../myaddon/data.js';
export declare class DoubleValueRequest implements flatbuffers.IUnpackableObject<DoubleValueRequestT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): DoubleValueRequest;
    static getRootAsDoubleValueRequest(bb: flatbuffers.ByteBuffer, obj?: DoubleValueRequest): DoubleValueRequest;
    static getSizePrefixedRootAsDoubleValueRequest(bb: flatbuffers.ByteBuffer, obj?: DoubleValueRequest): DoubleValueRequest;
    version(): number;
    config(obj?: Config): Config | null;
    data(index: number, obj?: Data): Data | null;
    dataLength(): number;
    static startDoubleValueRequest(builder: flatbuffers.Builder): void;
    static addVersion(builder: flatbuffers.Builder, version: number): void;
    static addConfig(builder: flatbuffers.Builder, configOffset: flatbuffers.Offset): void;
    static addData(builder: flatbuffers.Builder, dataOffset: flatbuffers.Offset): void;
    static createDataVector(builder: flatbuffers.Builder, data: flatbuffers.Offset[]): flatbuffers.Offset;
    static startDataVector(builder: flatbuffers.Builder, numElems: number): void;
    static endDoubleValueRequest(builder: flatbuffers.Builder): flatbuffers.Offset;
    static finishDoubleValueRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    static finishSizePrefixedDoubleValueRequestBuffer(builder: flatbuffers.Builder, offset: flatbuffers.Offset): void;
    unpack(): DoubleValueRequestT;
    unpackTo(_o: DoubleValueRequestT): void;
}
export declare class DoubleValueRequestT implements flatbuffers.IGeneratedObject {
    version: number;
    config: ConfigT | null;
    data: (DataT)[];
    constructor(version?: number, config?: ConfigT | null, data?: (DataT)[]);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=double-value-request.d.ts.map