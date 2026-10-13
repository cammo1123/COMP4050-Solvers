# Code generation targets

The generator parses each schema once into the language-neutral IR in
`schema/ir.mjs`. Targets consume that IR and implement this interface:

```js
{
  id: string,
  flatcArgs: string[],
  outputDir: string,
  emit(schema, { basename, label }): string[],
  emitBarrel?(symbols): string | null,
}
```

To add a language, create `targets/<language>.mjs` with that interface and add
one entry to `targets/index.mjs`. The parser, schema analysis, and CLI do not
need language-specific changes.
