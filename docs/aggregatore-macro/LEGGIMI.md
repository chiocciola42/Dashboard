# Correzioni alla macro dell'Aggregatore (v5.0)

Moduli VBA completi, già corretti, da sostituire nel file `.xlsm`.

| Modulo | Correzione |
| --- | --- |
| `Mod_ControlliQualita.bas` | Controllo 12: il messaggio dice «in dashboard compare come 'Non classificato'» (l'app mostra così gli IF senza ambito; prima diceva 'Altro'). |
| `Mod_Anagrafica.bas` | `ImportaDaAmbiti` completa Ambito e Attivazione immediata **vuoti** delle IF già presenti in «Anagrafica IF», copiandoli dal foglio «Ambiti». Prima saltava ogni IF già presente, e siccome `SincronizzaAnagrafica` le aggiunge subito vuote, la classificazione non veniva mai importata (da qui i 50 avvisi «IF non classificata» contro i 20 di «Config»). Un valore già compilato non viene mai sovrascritto. |

## Applicazione (una volta sola)

1. Apri il file `.xlsm` con le macro abilitate e premi `Alt+F11`.
2. Nel riquadro Progetto, tasto destro su `Mod_Anagrafica` → **Rimuovi Mod_Anagrafica** → «No» all'esportazione. Ripeti per `Mod_ControlliQualita`.
3. `File` → **Importa file…** e scegli i due `.bas` di questa cartella.
4. Esegui `InizializzaAggregatore` (riempie Ambito/Attivazione da «Ambiti») e poi `AggregaModuli`.

I file sono in codifica Windows-1252 con fine riga CRLF, come li esporta il VBE: non convertirli.
