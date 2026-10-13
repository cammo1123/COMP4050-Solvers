export interface ParsedField {
	name: string;
	type: string;
	optional: boolean;
	nullable: boolean;
	defaultValue?: string;
	attributes: string[];
	enumName?: string;
}

export type IntRange = {
	min: number;
	max: number;
	cppMin: string;
	cppMax: string;
	label: string;
};

export const SCALARS: ReadonlySet<string>;

export const INT_RANGES: Readonly<Record<string, IntRange>>;

export type ResolvedField =
	| (ParsedField & { kind: "vector-string" })
	| (ParsedField & { kind: "vector-scalar"; scalar: string })
	| (ParsedField & { kind: "vector-table"; table: string })
	| (ParsedField & { kind: "string" })
	| (ParsedField & { kind: "scalar"; scalar: string })
	| (ParsedField & { kind: "table"; table: string })
	| (ParsedField & {
			kind: "union";
			union: string;
			members: string[];
	  });

export interface Schema {
	namespace: string;
	request?: string;
	response?: string;
	tables: Record<string, ParsedField[]>;
	enums: Record<string, { underlying: string; values: Record<string, number> }>;
	unions: Record<string, string[]>;
	declaredTables: string[];
	declaredEnums: string[];
	declaredUnions: string[];
	includes: string[];
	resolvedTables: Record<string, ResolvedField[]>;
}

export function stripComments(text: string): string;

export function parseFields(body: string): ParsedField[];

export function parseSchema(
	text: string,
	label: string,
	options?: { requireRoot?: boolean },
): Schema;

export function loadSchema(schemaPath: string, label?: string): Schema;