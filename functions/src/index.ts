import { createUser, updateUser, deleteUser } from "./usuarios";
import {
  createResidencia,
  updateResidencia,
  deleteResidencia,
} from "./residencias";
import { guardarHorariosResidencia } from "./horarios";
import {
  actualizarMatrizAccesos,
  asignarAsistenteProxy,
  revocarAsistenteProxy,
} from "./asistentes";
import { createHardcodedMasterUser, seedDatabase } from "./PRUEBAS";

import { logActionCallable } from "./common/logging";

export {
  createUser,
  updateUser,
  deleteUser,
  createResidencia,
  updateResidencia,
  deleteResidencia,
  guardarHorariosResidencia,
  actualizarMatrizAccesos,
  asignarAsistenteProxy,
  revocarAsistenteProxy,
  createHardcodedMasterUser,
  seedDatabase,
  logActionCallable,
};
