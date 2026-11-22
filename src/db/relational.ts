import {
  and,
  type AnyColumn,
  getTableColumns,
  inArray,
  Many,
  normalizeRelation,
  type SQL,
  type Table,
  type TablesRelationalConfig,
} from "drizzle-orm";

// MariaDB-compatible replacement for Drizzle's relational query builder
// (`db.query.<table>.findMany/findFirst`).
//
// Why: Drizzle builds nested `with` relations either with LATERAL joins
// (mode "default") or correlated derived tables (mode "planetscale").
// MariaDB, which Hostinger runs, supports neither. This loader keeps the same
// call shape but runs one plain SELECT for the parent rows and one
// `WHERE key IN (...)` SELECT per relation, then stitches results in memory.
//
// Supported options (everything this codebase uses): columns, where (SQL),
// orderBy (SQL or array), limit, offset, and nested `with` with the same
// options. Callback-style where/orderBy and `extras` are not supported.

type QueryConfig = {
  columns?: Record<string, boolean>;
  where?: SQL;
  orderBy?: SQL | AnyColumn | (SQL | AnyColumn)[];
  limit?: number;
  offset?: number;
  with?: Record<string, true | QueryConfig>;
};

type Row = Record<string, unknown>;

// Minimal shape shared by the db and transaction objects.
type Runner = {
  select: () => {
    from: (t: Table) => {
      where: (w: SQL | undefined) => {
        orderBy: (...o: (SQL | AnyColumn)[]) => {
          limit: (n: number) => { offset: (n: number) => Promise<Row[]> } & Promise<Row[]>;
        } & Promise<Row[]>;
      };
    };
  };
};

type Ctx = {
  schema: TablesRelationalConfig;
  tableNamesMap: Record<string, string>;
  fullSchema: Record<string, unknown>;
};

function tsNameOfTable(ctx: Ctx, table: Table): string {
  for (const [name, value] of Object.entries(ctx.fullSchema)) {
    if (value === table) return name;
  }
  throw new Error("Relational loader: table not found in schema");
}

function keyOfColumn(table: Table, column: AnyColumn): string {
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (col === column) return key;
  }
  throw new Error(`Relational loader: column ${column.name} not found`);
}

function project(row: Row, columns: Record<string, boolean> | undefined, relationKeys: string[]): Row {
  if (!columns) return row;
  const includes = Object.entries(columns).filter(([, v]) => v).map(([k]) => k);
  const out: Row = {};
  if (includes.length) {
    for (const k of includes) out[k] = row[k];
  } else {
    // Only exclusions given: keep everything except those.
    for (const [k, v] of Object.entries(row)) if (columns[k] !== false) out[k] = v;
  }
  for (const k of relationKeys) out[k] = row[k];
  return out;
}

async function load(runner: Runner, ctx: Ctx, tsName: string, config: QueryConfig = {}): Promise<Row[]> {
  const table = ctx.fullSchema[tsName] as Table;
  const tableConfig = ctx.schema[tsName];
  const orderBy = config.orderBy === undefined ? [] : Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

  let query = runner.select().from(table).where(config.where).orderBy(...orderBy) as unknown as Promise<Row[]> & {
    limit: (n: number) => Promise<Row[]> & { offset: (n: number) => Promise<Row[]> };
  };
  if (config.limit !== undefined) {
    const limited = query.limit(config.limit);
    query = (config.offset ? limited.offset(config.offset) : limited) as typeof query;
  }
  const rows: Row[] = await query;
  const relationKeys = Object.keys(config.with ?? {});

  for (const relKey of relationKeys) {
    const relation = tableConfig.relations[relKey];
    if (!relation) throw new Error(`Relational loader: unknown relation ${tsName}.${relKey}`);
    const nested: QueryConfig = config.with![relKey] === true ? {} : (config.with![relKey] as QueryConfig);
    const { fields, references } = normalizeRelation(ctx.schema, ctx.tableNamesMap, relation);
    const sourceKey = keyOfColumn(table, fields[0] as AnyColumn);
    const targetTable = relation.referencedTable as Table;
    const targetTs = tsNameOfTable(ctx, targetTable);
    const targetKey = keyOfColumn(targetTable, references[0] as AnyColumn);
    const isMany = relation instanceof Many;

    const values = [...new Set(rows.map((r) => r[sourceKey]).filter((v) => v !== null && v !== undefined))];
    let related: Row[] = [];
    if (values.length) {
      const inWhere = inArray(references[0] as AnyColumn, values as (string | number)[]);
      // Per-parent limit/offset is applied after grouping, so fetch without it.
      related = await load(runner, ctx, targetTs, {
        ...nested,
        columns: undefined,
        limit: undefined,
        offset: undefined,
        where: nested.where ? and(inWhere, nested.where) : inWhere,
      });
    }

    const groups = new Map<unknown, Row[]>();
    for (const r of related) {
      const k = r[targetKey];
      const list = groups.get(k);
      if (list) list.push(r);
      else groups.set(k, [r]);
    }
    const nestedRelKeys = Object.keys(nested.with ?? {});
    for (const row of rows) {
      const list = groups.get(row[sourceKey]) ?? [];
      if (isMany) {
        const start = nested.offset ?? 0;
        const sliced = list.slice(start, nested.limit !== undefined ? start + nested.limit : undefined);
        row[relKey] = sliced.map((r) => project(r, nested.columns, nestedRelKeys));
      } else {
        row[relKey] = list[0] ? project(list[0], nested.columns, nestedRelKeys) : null;
      }
    }
  }
  return rows;
}

/**
 * Build a `db.query`-compatible object backed by the MariaDB-safe loader.
 * Pass the db (or a transaction) and the db's internal relational config.
 */
export function createQueryApi<T>(runner: unknown, ctx: Ctx): T {
  const api: Record<string, unknown> = {};
  for (const tsName of Object.keys(ctx.schema)) {
    api[tsName] = {
      findMany: async (config: QueryConfig = {}) => {
        const rows = await load(runner as Runner, ctx, tsName, config);
        return rows.map((r) => project(r, config.columns, Object.keys(config.with ?? {})));
      },
      findFirst: async (config: QueryConfig = {}) => {
        const rows = await load(runner as Runner, ctx, tsName, { ...config, limit: 1 });
        return rows[0] ? project(rows[0], config.columns, Object.keys(config.with ?? {})) : undefined;
      },
    };
  }
  return api as T;
}
