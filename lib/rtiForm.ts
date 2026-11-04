// Validation of the "Parametri RTI" form. Returns the first error message, or
// null when the values can be sent to the server.
export function validateRtiForm(v: { mass: number; intPct: number; delPct: number }): string | null {
  if (!Number.isFinite(v.mass) || v.mass < 0) {
    return 'Il massimale contrattuale deve essere un numero >= 0.';
  }
  if (!Number.isFinite(v.intPct) || v.intPct < 0 || v.intPct > 100) {
    return 'La quota % Intellera deve essere compresa tra 0 e 100.';
  }
  if (!Number.isFinite(v.delPct) || v.delPct < 0 || v.delPct > 100) {
    return 'La quota % Deloitte (100 − Intellera) deve restare tra 0 e 100.';
  }
  return null;
}
