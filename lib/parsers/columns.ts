// Intestazioni degli export SAP usate dai parser v2. Se SAP rinomina una
// colonna si corregge qui, senza toccare parser e importer (il confronto è
// comunque insensibile a maiuscole, accenti e punteggiatura: vedi looseGetter).
export const COL = {
  bdo: ['Numero BDO'],
  // "Fornitore RTI" è il CONTRATTO (raggruppamento) a cui il BdO appartiene.
  contratto: ['Fornitore RTI'],
} as const;
