











let fullTablePromise: Promise<void> | null = null;
let fullTableReady = false;


export function languageTableReady(): boolean {
  return fullTableReady;
}


export function ensureFullLanguageTable(): Promise<void> {
  fullTablePromise ??= import("refractor/all")
    .then(() => {
      fullTableReady = true;
    })
    .catch((error: unknown) => {


      fullTablePromise = null;
      throw error;
    });
  return fullTablePromise;
}
