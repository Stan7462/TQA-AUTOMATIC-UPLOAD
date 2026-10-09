export type DbValue = string | number | null | Uint8Array;
export interface Statement {
 sql:string; values:DbValue[];
 bind(...values:DbValue[]):Statement;
 get<T=Record<string,unknown>>(...values:DbValue[]):Promise<T|undefined>;
 first<T=Record<string,unknown>>():Promise<T|null>;
 all<T=Record<string,unknown>>(...values:DbValue[]):Promise<T[]>;
 run(...values:DbValue[]):Promise<{changes:number;meta:{changes:number}}>;
}
export function postgresSql(sql:string):string;
export function createDatabase(options?:{url?:string;sqlite?:unknown}):{
 prepare(sql:string):Statement;
 batch(statements:Pick<Statement,"sql"|"values">[]):Promise<{meta:{changes:number}}[]>;
 close():Promise<void>;
 pool:import('pg').Pool|null;
};
