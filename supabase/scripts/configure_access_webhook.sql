-- Configura, por entorno, el aviso por email de nuevas solicitudes (SPEC-004).
-- Ejecutar con permisos de servidor (SQL Editor o psql como postgres).
-- El secreto debe coincidir con la variable ACCESS_WEBHOOK_SECRET del backend.
-- Para cambiarlos después, usa vault.update_secret(id, nuevo_valor).

select vault.create_secret(
  'https://TU-DOMINIO/api/webhooks/access-request-created',
  'access_webhook_url'
);

select vault.create_secret(
  'REEMPLAZAR-POR-UN-SECRETO-LARGO-Y-ALEATORIO',
  'access_webhook_secret'
);
