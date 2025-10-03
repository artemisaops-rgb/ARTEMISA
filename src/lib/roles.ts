export type UIRole = "admin" | "trabajador" | "cliente";

/** En BD usamos exactamente los mismos que las reglas: owner | worker | client */
export type DBRole = "owner" | "worker" | "client";

export const uiToDb: Record<UIRole, DBRole> = {
  admin: "owner",
  trabajador: "worker",
  cliente: "client",
};

export const dbToUi: Record<DBRole, UIRole> = {
  owner: "admin",
  worker: "trabajador",
  client: "cliente",
};
