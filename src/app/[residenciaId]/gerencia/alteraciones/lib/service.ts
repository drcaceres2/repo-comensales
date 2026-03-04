"use client";

import { db, functions } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type {
  AlteracionHorario,
  CreateAlteracionPayload,
} from "shared/schemas/alteraciones";
import type { GrupoComida, TiempoComida } from "shared/schemas/horarios";
import type { ConfiguracionResidencia } from "shared/schemas/residencia";

export interface AlteracionesConfigData {
  gruposComidas: Record<string, GrupoComida>;
  tiemposComida: Record<string, TiempoComida>;
}

const createAlteracionFn = httpsCallable<
  CreateAlteracionPayload,
  { id: string }
>(functions, "createAlteracionFn");

export async function fetchAlteraciones(
  residenciaId: string
): Promise<AlteracionHorario[]> {
  try {
    const alteracionesQuery = query(
      collection(db, "alteracionesHorario"),
      where("residenciaId", "==", residenciaId),
      orderBy("fechaInicio", "desc")
    );

    const snapshot = await getDocs(alteracionesQuery);

    return snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        ...data,
        id: doc.id,
      } as unknown as AlteracionHorario;
    });
  } catch (error: unknown) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (
      errorCode.includes("permission-denied") ||
      errorCode.includes("failed-precondition")
    ) {
      return [];
    }

    throw error;
  }
}

export async function fetchAlteracionesConfig(
  residenciaId: string
): Promise<AlteracionesConfigData> {
  const configRef = doc(db, "residencias", residenciaId, "configuracion", "general");
  const configSnap = await getDoc(configRef);

  if (!configSnap.exists()) {
    return {
      gruposComidas: {},
      tiemposComida: {},
    };
  }

  const configData = configSnap.data() as ConfiguracionResidencia;

  return {
    gruposComidas: configData.gruposComidas ?? {},
    tiemposComida: configData.esquemaSemanal ?? {},
  };
}

export async function callCreateAlteracion(
  data: CreateAlteracionPayload
): Promise<{ id: string }> {
  const result = await createAlteracionFn(data);
  return result.data;
}