export function recordDiagnostic(storage: DurableObjectStorage, destination: 'drive' | 'notion', stage: string, code: string): void {
  storage.sql.exec(
    'INSERT INTO mirror_diagnostics(destination,failure_stage,error_code,updated_at) VALUES(?,?,?,?) ON CONFLICT(destination) DO UPDATE SET failure_stage=excluded.failure_stage,error_code=excluded.error_code,updated_at=excluded.updated_at',
    destination,
    stage.slice(0, 64),
    code.slice(0, 64),
    new Date().toISOString(),
  );
}

export function readDiagnosticStage(storage: DurableObjectStorage, destination: 'drive' | 'notion'): string | null {
  const row = storage.sql
    .exec<{ failure_stage: string }>('SELECT failure_stage FROM mirror_diagnostics WHERE destination = ?', destination)
    .toArray()[0];
  return row?.failure_stage ?? null;
}
