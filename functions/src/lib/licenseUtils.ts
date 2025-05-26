// functions/src/utils/licenseUtils.ts
import { storage } from './firebase';

const licenseBucketName = "lmgmt";
const licenseFilesPath = "comensales-licencia/";

// Assuming your LicenseDetailsResult interface is defined here or imported
export interface LicenseDetailsResult {
  status: "valid" | "not_found" | "not_active" | "expired" | "invalid_token" | "error_reading_file" | "mismatch";
  residenciaId?: string;
  // ... other properties from your interface
}

export async function fetchLicenseDetails(residenciaId: string): Promise<LicenseDetailsResult> {
  const filePath = `${licenseFilesPath}${residenciaId}.json`;
  const file = storage.bucket(licenseBucketName).file(filePath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`License file not found for ${residenciaId} at ${filePath}`);
      return { status: "not_found", residenciaId };
    }

    const [buffer] = await file.download();
    const licenseData = JSON.parse(buffer.toString());

    // Basic validation (expand as needed)
    if (!licenseData.residenciaId || !licenseData.status) {
      return { status: "invalid_token", residenciaId }; // Or some other error for malformed
    }
    
    if (licenseData.residenciaId !== residenciaId) {
        console.warn(`License file name ${residenciaId}.json mismatch with content residenciaId ${licenseData.residenciaId}`);
        // You might want a specific status for this, e.g., "mismatch"
        return { status: "mismatch", residenciaId: licenseData.residenciaId }; 
    }

    // Assuming licenseData matches or extends LicenseDetailsResult structure
    return {
        status: licenseData.status as LicenseDetailsResult['status'], // Cast status if necessary
        residenciaId: licenseData.residenciaId,
        licenciaValidaHasta: licenseData.licenciaValidaHasta,
        licenciaActiva: licenseData.licenciaActiva,
        cantidadUsuarios: licenseData.cantidadUsuarios,
        // ... map other properties
    } as LicenseDetailsResult; // Ensure the returned object matches the interface

  } catch (error) {
    console.error(`Error reading license file for ${residenciaId}:`, error);
    return { status: "error_reading_file", residenciaId };
  }
}
