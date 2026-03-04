import { db } from "@/lib/firebaseAdmin";
import type { AlteracionHorario } from "shared/schemas/alteraciones";

export async function fetchAlteracionesServer(
  residenciaId: string
): Promise<AlteracionHorario[]> {
  const snapshot = await db
    .collection("alteracionesHorario")
    .where("residenciaId", "==", residenciaId)
    .orderBy("fechaInicio", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      ...data,
      id: doc.id,
    } as unknown as AlteracionHorario;
  });
}