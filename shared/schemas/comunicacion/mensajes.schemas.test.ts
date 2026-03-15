import { describe, expect, it } from 'vitest';
import { MensajeSchema } from './mensajes.dominio';
import {
  CambiarEstadoMensajeSchema,
  FormNuevoMensajeSchema,
  GRUPO_TECNICO_DIRECCION_GENERAL,
} from './mensajes.dto';

describe('mensajes schemas', () => {
  it('acepta formulario con destino usuario', () => {
    const result = FormNuevoMensajeSchema.safeParse({
      destinoTipo: 'usuario',
      destinatarioUsuarioId: 'abc123',
      asunto: 'duda_operativa',
      cuerpo: 'Necesito confirmar el horario de mañana.',
    });

    expect(result.success).toBe(true);
  });

  it('acepta formulario con destino grupo técnico de dirección general', () => {
    const result = FormNuevoMensajeSchema.safeParse({
      destinoTipo: 'grupo',
      destinatarioGrupoAnaliticoId: GRUPO_TECNICO_DIRECCION_GENERAL,
      asunto: 'solicitud_aprobacion',
      cuerpo: 'Solicito revisar mi excepción de comida.',
    });

    expect(result.success).toBe(true);
  });

  it('rechaza payload que mezcla destino usuario y grupo', () => {
    const result = FormNuevoMensajeSchema.safeParse({
      destinoTipo: 'usuario',
      destinatarioUsuarioId: 'abc123',
      destinatarioGrupoAnaliticoId: 'grupo-x',
      asunto: 'otro',
      cuerpo: 'Texto válido para probar la validación.',
    });

    expect(result.success).toBe(false);
  });

  it('acepta mensaje persistido de tipo grupo con destinatario efectivo', () => {
    const result = MensajeSchema.safeParse({
      residenciaId: 'residencia-test',
      remitenteId: 'sender123',
      remitenteRol: 'director',
      destinatarioId: 'target456',
      destinoTipo: 'grupo',
      destinatarioGrupoAnaliticoId: 'grupo-analitico-1',
      asunto: 'modificacion_directiva',
      cuerpo: 'Se modificó el horario de la semana.',
      estado: 'enviado',
    });

    expect(result.success).toBe(true);
  });

  it('valida transición manual de estado', () => {
    const result = CambiarEstadoMensajeSchema.safeParse({
      mensajeId: 'mensaje123',
      estado: 'archivado',
    });

    expect(result.success).toBe(true);
  });
});

