/* 
Futuro archivo comercial
========================

Fijarse en la relación de los estados de la residencia:

    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
    estado: z.enum(['aprovisionado', 'activo', 'archivado', 're-aprovisionado']),

Todas las combinaciones son posibles sin consecuencias excepto:
contrato  | estado              | consecuencia
----------+---------------------+-------------------
activo    |  archivado          | Orden de trabajo para activar el sistema
prueba    |  archivado          | Orden de trabajo para activar el sistema
inactivo  |  aprovisionado      | Recordatorio a usuario maestro para archivar el sistema
inactivo  |  re-aprovisionado   | Recordatorio a usuario maestro para archivar el sistema
inactivo  |  activo             | Recordatorio a usuario maestro para activar el sistema

*/