Attribute VB_Name = "Mod_ControlliQualita"
Option Explicit

' =====================================================================
'  AGGREGATORE - Mod_ControlliQualita v2.0 (rilascio 5.0)
'  Da eseguire DOPO AggregaModuli: verifica la qualità e la coerenza
'  dei dati aggregati e produce il foglio "Controlli Qualità" con
'  l'elenco delle anomalie classificate per severità.
'
'  NOVITA' v2.0 - richiede Mod_Comune
'    - Lettura dei fogli indipendente da filtri attivi e righe nascoste
'      (Mod_Comune.LeggiDatiFoglio al posto di End(xlUp), che con un
'      filtro attivo si fermava all'ultima riga visibile).
'    - Controllo 11: cartella non coerente con il Numero IF, piu' IF
'      nella stessa cartella.
'    - Controllo 12: IF non classificata nel foglio "Anagrafica IF".
'    - Controllo 13: controlli contrattuali (impegnato rispetto al
'      massimale; impegnato per partner rispetto alla quota RTI), con i
'      parametri del foglio "Config".
'
'  NOVITA' v1.1 (allineamento ad AggregaModuli v4.0)
'    - Collegamento righe OF/GdL -> IF tramite la colonna "Numero IF"
'      (V in Oggetto Fornitura, J in GdL); ricerca nel percorso solo
'      come ripiego per fogli generati da versioni precedenti.
'    - Conversione numerica corretta per testi con separatori italiani
'      ("1.234,56") senza alterare valori come "1.5".
'    - Lettura colonne data robusta (valori Error ignorati).
'    - Nuovo controllo 9: milestone del GdL assente nell'Oggetto
'      Fornitura della stessa IF.
'
'  CONTROLLI ESEGUITI
'   1. ERRORE  Numero IF duplicato in "Generalità Intervento"
'   2. ERRORE  Campi chiave vuoti (Numero IF, Titolo) / WARN CIG vuoto
'   3. WARN    Somma "Costo Complessivo" (Oggetto Fornitura) diversa
'              da "Importo Intervento" (Generalità) per la stessa IF
'   4. WARN    Costo Complessivo <> Quantità x Costo Unitario
'   5. WARN    Date incoerenti: Data Inizio > Data Fine
'   6. WARN    GdL: GG/Uomo non numerico o <= 0
'   7. INFO    IF presenti in Generalità ma senza righe di fornitura
'   8. INFO    Righe di fornitura/GdL senza IF in Generalità (orfane)
'   9. INFO    Milestone GdL non presente nell'Oggetto Fornitura dell'IF
'  10. ERRORE  Fornitore (OF) / Azienda di Appartenenza (GdL) vuoti:
'              la riga resta fuori dalle quote per partner
'      WARN    Denominazione diversa dalla forma canonica
'              (Module1.NormalizzaFornitore, AggregaModuli v4.2)
'  11. WARN    Il nome della cartella indica un'IF diversa dal Numero IF
'      WARN    Piu' IF nella stessa cartella
'  12. WARN    IF assente da "Anagrafica IF" o senza Ambito (in dashboard
'              comparirebbe come "Non classificato")
'      INFO    IF in anagrafica ma non piu' in Generalità
'  13. ERRORE  Impegnato totale oltre il massimale di contratto
'      WARN    Impegnato di un partner oltre la capienza della sua quota
'      INFO    Riepilogo impegnato / massimale e per partner
'
'  ENTRY POINT: EseguiControlliQualita
' =====================================================================

Private Const SH_GEN As String = "Generalità Intervento"
Private Const SH_OF  As String = "Oggetto Fornitura"
Private Const SH_GDL As String = "GdL - Gruppo di Lavoro"
Private Const SH_CQ  As String = "Controlli Qualità"

Private Const NCOL_OF As Long = 22      ' V = Numero IF (v4.0)
Private Const NCOL_GDL As Long = 10     ' J = Numero IF (v4.0)

Private Const TOLL_EURO As Double = 0.01   ' tolleranza confronti monetari

Private mSilenzioso As Boolean
Private mRiepilogo As String

' Automazione / test: esegue i controlli senza finestre e restituisce il riepilogo
Public Function EseguiControlliQualitaSilenzioso() As String
    mSilenzioso = True
    EseguiControlliQualita
    mSilenzioso = False
    EseguiControlliQualitaSilenzioso = mRiepilogo
End Function

Public Sub EseguiControlliQualita()

    If Not FE(SH_GEN) Or Not FE(SH_OF) Or Not FE(SH_GDL) Then
        mRiepilogo = "Fogli dati aggregati mancanti. Eseguire prima AggregaModuli."
        If Not mSilenzioso Then MsgBox mRiepilogo, vbCritical
        Exit Sub
    End If

    Dim oldCalc As XlCalculation: oldCalc = Application.Calculation
    Dim oldScreen As Boolean: oldScreen = Application.ScreenUpdating
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fatale

    Dim wsGen As Worksheet, wsOF As Worksheet, wsGdL As Worksheet
    Set wsGen = ThisWorkbook.Worksheets(SH_GEN)
    Set wsOF = ThisWorkbook.Worksheets(SH_OF)
    Set wsGdL = ThisWorkbook.Worksheets(SH_GDL)

    ' --- Lettura dati in array ---
    Dim vGen As Variant, vOF As Variant, vGdL As Variant
    vGen = LeggiDati(wsGen, 25)
    vOF = LeggiDati(wsOF, NCOL_OF)
    vGdL = LeggiDati(wsGdL, NCOL_GDL)

    ' Colonna "Numero IF" disponibile (fogli generati dalla v4.0)?
    Dim ofConIF As Boolean, gdlConIF As Boolean
    ofConIF = (StrComp(Trim$(CStr(Nz(wsOF.Cells(1, NCOL_OF).Value))), "Numero IF", vbTextCompare) = 0)
    gdlConIF = (StrComp(Trim$(CStr(Nz(wsGdL.Cells(1, NCOL_GDL).Value))), "Numero IF", vbTextCompare) = 0)

    Dim esiti As New Collection   ' righe: (Severità, Controllo, IF, Dettaglio)
    Dim i As Long

    ' --- Strutture di appoggio ---
    Dim dictIF As Object: Set dictIF = NuovoDict()        ' numIF -> riga Gen
    Dim dictImporto As Object: Set dictImporto = NuovoDict()
    Dim sumOF As Object: Set sumOF = NuovoDict()          ' numIF -> somma costi OF
    Dim milestoneOF As Object: Set milestoneOF = NuovoDict()  ' numIF|milestone -> True

    ' ===== Controlli su Generalità =====
    Dim numIF As String, titolo As String, cig As String
    If IsArray(vGen) Then
        For i = 1 To UBound(vGen, 1)
            numIF = ChiaveIF(vGen(i, 3))
            titolo = Trim$(CStr(Nz(vGen(i, 2))))
            cig = Trim$(CStr(Nz(vGen(i, 9))))

            If numIF = "" And titolo = "" And Trim$(CStr(Nz(vGen(i, 1)))) = "" Then GoTo ProssimaGen

            ' 2. campi chiave vuoti
            If numIF = "" Then AddEsito esiti, "ERRORE", "Campo chiave vuoto", "(riga " & i + 1 & ")", "Numero IF mancante - file: " & Right$(CStr(Nz(vGen(i, 1))), 60)
            If titolo = "" Then AddEsito esiti, "ERRORE", "Campo chiave vuoto", numIF, "Titolo Intervento mancante"
            If cig = "" Then AddEsito esiti, "WARN", "Campo chiave vuoto", numIF, "CIG mancante"

            ' 1. IF duplicato
            If numIF <> "" Then
                If dictIF.Exists(numIF) Then
                    AddEsito esiti, "ERRORE", "IF duplicato", numIF, _
                             "Presente sia in riga " & dictIF(numIF) + 1 & " sia in riga " & i + 1 & " di Generalità"
                Else
                    dictIF.Add numIF, i
                    dictImporto(numIF) = ToNum(vGen(i, 10))
                End If
            End If

            ' 5. date incoerenti (Generalità: col 11 inizio, col 12 fine)
            If DataValida(vGen(i, 11)) And DataValida(vGen(i, 12)) Then
                If CDate(vGen(i, 11)) > CDate(vGen(i, 12)) Then _
                    AddEsito esiti, "WARN", "Date incoerenti (Generalità)", numIF, _
                             "Inizio " & Format$(vGen(i, 11), "dd/mm/yyyy") & " > Fine " & Format$(vGen(i, 12), "dd/mm/yyyy")
            End If
ProssimaGen:
        Next i
    End If

    ' ===== Controlli su Oggetto Fornitura =====
    Dim ifOF As String, q As Double, cu As Double, cc As Double
    If IsArray(vOF) Then
        For i = 1 To UBound(vOF, 1)
            If ofConIF Then ifOF = ChiaveIF(vOF(i, NCOL_OF)) Else ifOF = IFDaPath(CStr(Nz(vOF(i, 1))), dictIF)
            If ifOF <> "" And Not dictIF.Exists(ifOF) Then ifOF = ""

            If ifOF <> "" Then
                sumOF(ifOF) = sumOF(ifOF) + ToNum(vOF(i, 13))
                milestoneOF(ifOF & "|" & Trim$(CStr(Nz(vOF(i, 6))))) = True
                ' 10. fornitore vuoto o non normalizzato
                ControllaFornitore esiti, vOF(i, 14), ifOF, "Fornitore", "Linea " & CStr(Nz(vOF(i, 2)))
            Else
                ' 8. riga orfana
                AddEsito esiti, "INFO", "Riga fornitura orfana", "(riga " & i + 1 & ")", _
                         "Nessuna IF in Generalità per il file: " & Right$(CStr(Nz(vOF(i, 1))), 60)
            End If

            ' 4. costo complessivo vs quantità x costo unitario
            q = ToNum(vOF(i, 10)): cu = ToNum(vOF(i, 12)): cc = ToNum(vOF(i, 13))
            If q > 0 And cu > 0 And cc > 0 Then
                If Abs(q * cu - cc) > TOLL_EURO Then _
                    AddEsito esiti, "WARN", "Costo riga incoerente", ifOF, _
                             "Linea " & CStr(Nz(vOF(i, 2))) & ": Q(" & q & ") x CU(" & Format$(cu, "#,##0.00") & _
                             ") = " & Format$(q * cu, "#,##0.00") & " <> Costo Complessivo " & Format$(cc, "#,##0.00")
            End If

            ' 5. date incoerenti (OF: col 4 inizio, col 5 fine)
            If DataValida(vOF(i, 4)) And DataValida(vOF(i, 5)) Then
                If CDate(vOF(i, 4)) > CDate(vOF(i, 5)) Then _
                    AddEsito esiti, "WARN", "Date incoerenti (Fornitura)", ifOF, _
                             "Linea " & CStr(Nz(vOF(i, 2))) & ": Inizio " & Format$(vOF(i, 4), "dd/mm/yyyy") & _
                             " > Fine " & Format$(vOF(i, 5), "dd/mm/yyyy")
            End If
        Next i
    End If

    ' 3. somma costi OF vs Importo Intervento / 7. IF senza fornitura
    Dim k As Variant, impDic As Double, sumD As Double
    For Each k In dictIF.Keys
        impDic = dictImporto(CStr(k))
        If sumOF.Exists(CStr(k)) Then
            sumD = sumOF(CStr(k))
            If Abs(impDic - sumD) > TOLL_EURO Then _
                AddEsito esiti, "WARN", "Importo IF <> somma fornitura", CStr(k), _
                         "Importo Intervento " & Format$(impDic, "#,##0.00") & _
                         " | Somma Costi Complessivi " & Format$(sumD, "#,##0.00") & _
                         " | Delta " & Format$(impDic - sumD, "#,##0.00")
        Else
            AddEsito esiti, "INFO", "IF senza righe di fornitura", CStr(k), _
                     "Nessuna riga in '" & SH_OF & "' per questa IF"
        End If
    Next k

    ' ===== Controlli su GdL =====
    Dim ifG As String, gg As Variant, mil As String
    If IsArray(vGdL) Then
        For i = 1 To UBound(vGdL, 1)
            If gdlConIF Then ifG = ChiaveIF(vGdL(i, NCOL_GDL)) Else ifG = IFDaPath(CStr(Nz(vGdL(i, 1))), dictIF)
            If ifG <> "" And Not dictIF.Exists(ifG) Then ifG = ""

            ' 6. GG/Uomo
            gg = Nz(vGdL(i, 6))
            If Trim$(CStr(gg)) <> "" Then
                If Not IsNumeric(gg) Then
                    AddEsito esiti, "WARN", "GG/Uomo non numerico", ifG, _
                             "Risorsa '" & CStr(Nz(vGdL(i, 5))) & "': valore '" & CStr(gg) & "'"
                ElseIf CDbl(gg) <= 0 Then
                    AddEsito esiti, "WARN", "GG/Uomo <= 0", ifG, _
                             "Risorsa '" & CStr(Nz(vGdL(i, 5))) & "': valore " & CStr(gg)
                End If
            End If

            If ifG = "" Then
                ' 8. riga orfana
                AddEsito esiti, "INFO", "Riga GdL orfana", "(riga " & i + 1 & ")", _
                         "Nessuna IF in Generalità per il file: " & Right$(CStr(Nz(vGdL(i, 1))), 60)
            Else
                ' 10. azienda vuota o non normalizzata
                ControllaFornitore esiti, vGdL(i, 7), ifG, "Azienda di Appartenenza", _
                                   "Riga " & i + 1 & " (" & CStr(Nz(vGdL(i, 4))) & ")"
                ' 9. milestone GdL senza corrispondenza in Oggetto Fornitura
                mil = Trim$(CStr(Nz(vGdL(i, 2))))
                If mil <> "" And sumOF.Exists(ifG) Then
                    If Not milestoneOF.Exists(ifG & "|" & mil) Then _
                        AddEsito esiti, "INFO", "Milestone GdL non in fornitura", ifG, _
                                 "Milestone '" & mil & "' (riga " & i + 1 & ") assente nell'Oggetto Fornitura dell'IF"
                End If
            End If
        Next i
    End If

    ' ===== 11. Coerenza tra cartelle e Numero IF (v2.0) =====
    Dim perCartella As Object: Set perCartella = NuovoDict()
    Dim cartella As String, ifCartella As String
    If IsArray(vGen) Then
        For i = 1 To UBound(vGen, 1)
            numIF = ChiaveIF(vGen(i, 3))
            cartella = CartellaSorgente(CStr(Nz(vGen(i, 1))))
            If numIF <> "" And cartella <> "" And dictIF.Exists(numIF) Then
                ifCartella = EstraiNumeroIF_DaNome(UltimoSegmento(cartella))
                If ifCartella <> "" And ifCartella <> numIF Then
                    AddEsito esiti, "WARN", "Cartella non coerente con il Numero IF", numIF, _
                             "La cartella '" & UltimoSegmento(cartella) & "' indica l'IF " & ifCartella & _
                             ": spostare il file in una cartella dedicata"
                End If
                If perCartella.Exists(cartella) Then
                    If InStr(", " & perCartella(cartella) & ",", ", " & numIF & ",") = 0 Then _
                        perCartella(cartella) = perCartella(cartella) & ", " & numIF
                Else
                    perCartella.Add cartella, numIF
                End If
            End If
        Next i
    End If
    For Each k In perCartella.Keys
        If InStr(CStr(perCartella(k)), ",") > 0 Then
            AddEsito esiti, "WARN", "Più IF nella stessa cartella", CStr(perCartella(k)), _
                     "Cartella '" & UltimoSegmento(CStr(k)) & "': un MOD 104 senza Numero IF nel nome non viene applicato"
        End If
    Next k

    ' ===== 12. Anagrafica IF: classificazione per ambito (v2.0) =====
    Dim vAn As Variant, classificate As Object: Set classificate = NuovoDict()
    If FE(SH_ANAGRAFICA) Then
        vAn = LeggiDatiFoglio(ThisWorkbook.Worksheets(SH_ANAGRAFICA), 3)
        If IsArray(vAn) Then
            For i = 1 To UBound(vAn, 1)
                numIF = ChiaveIF(vAn(i, 1))
                If numIF <> "" Then
                    classificate(numIF) = (Len(Trim$(CStr(Nz(vAn(i, 3))))) > 0)
                    If Not dictIF.Exists(numIF) Then
                        AddEsito esiti, "INFO", "Anagrafica: IF non più in Generalità", numIF, _
                                 "Presente in '" & SH_ANAGRAFICA & "' ma non tra le IF aggregate"
                    End If
                End If
            Next i
        End If
        For Each k In dictIF.Keys
            If Not classificate.Exists(CStr(k)) Then
                AddEsito esiti, "WARN", "IF non classificata", CStr(k), _
                         "Assente da '" & SH_ANAGRAFICA & "': rieseguire AggregaModuli"
            ElseIf Not CBool(classificate(CStr(k))) Then
                AddEsito esiti, "WARN", "IF non classificata", CStr(k), _
                         "Ambito non compilato in '" & SH_ANAGRAFICA & "': in dashboard compare come 'Non classificato'"
            End If
        Next k
    Else
        AddEsito esiti, "INFO", "Anagrafica IF assente", "", _
                 "Foglio '" & SH_ANAGRAFICA & "' non presente: eseguire InizializzaAggregatore"
    End If

    ' ===== 13. Controlli contrattuali (v2.0) =====
    Dim massimale As Double, totImp As Double, impPartner As Double, quota As Double, capienza As Double
    Dim perPartner As Object: Set perPartner = NuovoDict()
    Dim forn As String, sev As String, dett As String
    massimale = ToNum(ConfigValore(CFG_MASSIMALE, 0))
    If IsArray(vOF) Then
        For i = 1 To UBound(vOF, 1)
            forn = Trim$(CStr(Nz(vOF(i, 14))))
            If forn = "" Then forn = "(fornitore vuoto)"
            impPartner = ToNum(vOF(i, 13))
            perPartner(forn) = perPartner(forn) + impPartner
            totImp = totImp + impPartner
        Next i
    End If
    If massimale <= 0 Then
        AddEsito esiti, "INFO", "Contratto: massimale non configurato", "", _
                 "Compilare '" & CFG_MASSIMALE & "' nel foglio '" & SH_CONFIG & "' per attivare i controlli contrattuali"
    Else
        sev = "INFO"
        If totImp > massimale + TOLL_EURO Then sev = "ERRORE"
        AddEsito esiti, sev, "Contratto: impegnato / massimale", "", _
                 "Impegnato " & Format$(totImp, "#,##0.00") & " su massimale " & Format$(massimale, "#,##0.00") & _
                 " (" & Format$(totImp / massimale, "0.0%") & ")"
        For Each k In perPartner.Keys
            impPartner = perPartner(k)
            quota = ToNum(ConfigValore(CFG_QUOTA & CStr(k), 0))
            If quota > 1 Then quota = quota / 100
            If quota <= 0 Then
                AddEsito esiti, "INFO", "Contratto: partner senza quota RTI", "", _
                         CStr(k) & ": impegnato " & Format$(impPartner, "#,##0.00") & _
                         "; nessuna riga '" & CFG_QUOTA & CStr(k) & "' nel foglio '" & SH_CONFIG & "'"
            Else
                capienza = quota * massimale
                sev = "INFO"
                If impPartner > capienza + TOLL_EURO Then sev = "WARN"
                dett = CStr(k) & ": impegnato " & Format$(impPartner, "#,##0.00")
                If totImp > 0 Then dett = dett & " = " & Format$(impPartner / totImp, "0.0%") & " dell'impegnato totale"
                dett = dett & " (quota RTI " & Format$(quota, "0.0%") & "); capienza della quota " & _
                       Format$(capienza, "#,##0.00") & ", utilizzata al " & Format$(impPartner / capienza, "0.0%")
                AddEsito esiti, sev, "Contratto: impegnato partner / quota RTI", "", dett
            End If
        Next k
    End If

    ' --- Output ---
    ScriviEsiti esiti

    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen

    Dim nErr As Long, nWarn As Long, nInfo As Long, item As Variant
    For Each item In esiti
        Select Case item(0)
            Case "ERRORE": nErr = nErr + 1
            Case "WARN": nWarn = nWarn + 1
            Case Else: nInfo = nInfo + 1
        End Select
    Next item
    mRiepilogo = "Errori: " & nErr & " | Warning: " & nWarn & " | Info: " & nInfo
    If mSilenzioso Then Exit Sub
    MsgBox "Controlli qualità completati." & vbCrLf & vbCrLf & _
           "Errori: " & nErr & vbCrLf & "Warning: " & nWarn & vbCrLf & "Info: " & nInfo & vbCrLf & vbCrLf & _
           "Dettagli nel foglio '" & SH_CQ & "'.", _
           IIf(nErr > 0, vbExclamation, vbInformation), "Controlli Qualità"
    Exit Sub

Fatale:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    mRiepilogo = "Errore imprevisto n. " & Err.Number & ": " & Err.Description
    If Not mSilenzioso Then MsgBox mRiepilogo, vbCritical, "Controlli Qualità"
End Sub

' ---------------------------------------------------------------
Private Sub ScriviEsiti(esiti As Collection)
    Dim ws As Worksheet
    If FE(SH_CQ) Then
        Set ws = ThisWorkbook.Worksheets(SH_CQ)
        ws.Cells.Clear
    Else
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = SH_CQ
        ws.Tab.Color = RGB(192, 80, 77)
    End If

    ws.Range("A1:E1").Value = Array("#", "Severità", "Controllo", "Numero IF", "Dettaglio")
    With ws.Range("A1:E1")
        .Font.Bold = True
        .Interior.Color = RGB(31, 73, 125)
        .Font.Color = vbWhite
    End With

    If esiti.Count = 0 Then
        ws.Range("A2:C2").Value = Array("-", "OK", "Nessuna anomalia rilevata")
        ws.Cells(2, 2).Interior.Color = RGB(198, 239, 206)
    Else
        Dim outArr() As Variant
        ReDim outArr(1 To esiti.Count, 1 To 5)
        Dim i As Long, item As Variant
        For Each item In esiti
            i = i + 1
            outArr(i, 1) = i
            outArr(i, 2) = item(0)
            outArr(i, 3) = item(1)
            outArr(i, 4) = item(2)
            outArr(i, 5) = item(3)
        Next item
        ws.Cells(2, 1).Resize(esiti.Count, 5).Value = outArr

        ' Colori per severità: una formattazione per blocco omogeneo
        Dim inizio As Long
        inizio = 1
        For i = 2 To esiti.Count + 1
            If i > esiti.Count Then
                ColoraSeverita ws, inizio, esiti.Count, CStr(outArr(inizio, 2))
            ElseIf outArr(i, 2) <> outArr(inizio, 2) Then
                ColoraSeverita ws, inizio, i - 1, CStr(outArr(inizio, 2))
                inizio = i
            End If
        Next i
    End If

    ws.Columns("A:E").AutoFit
    If ws.Columns(5).ColumnWidth > 90 Then ws.Columns(5).ColumnWidth = 90
    ws.Activate
    ws.Range("A1").Select
End Sub

Private Sub ColoraSeverita(ws As Worksheet, ByVal da As Long, ByVal a As Long, ByVal sev As String)
    Dim colore As Long
    Select Case sev
        Case "ERRORE": colore = RGB(255, 199, 206)
        Case "WARN":   colore = RGB(255, 235, 156)
        Case "INFO":   colore = RGB(221, 235, 247)
        Case Else: Exit Sub
    End Select
    ws.Range(ws.Cells(da + 1, 2), ws.Cells(a + 1, 2)).Interior.Color = colore
End Sub

Private Sub ControllaFornitore(esiti As Collection, ByVal v As Variant, ByVal numIF As String, _
                               ByVal campo As String, ByVal rif As String)
    Dim s As String: s = Trim$(CStr(Nz(v)))
    If s = "" Then
        AddEsito esiti, "ERRORE", campo & " vuoto", numIF, _
                 rif & ": riga esclusa dalle quote per partner"
    ElseIf CStr(NormalizzaFornitore(s)) <> s Then
        AddEsito esiti, "WARN", campo & " non normalizzato", numIF, _
                 rif & ": '" & s & "' -> '" & CStr(NormalizzaFornitore(s)) & "' (rieseguire AggregaModuli)"
    End If
End Sub

Private Sub AddEsito(esiti As Collection, ByVal sev As String, ByVal controllo As String, _
                     ByVal numIF As String, ByVal dettaglio As String)
    esiti.Add Array(sev, controllo, numIF, dettaglio)
End Sub

' Ripiego per fogli senza colonna "Numero IF": cerca il numero IF nel
' percorso sorgente, preferendo la corrispondenza più lunga
Private Function IFDaPath(ByVal srcPath As String, dictIF As Object) As String
    Dim k As Variant
    For Each k In dictIF.Keys
        If InStr(1, srcPath, CStr(k), vbTextCompare) > 0 Then
            If Len(CStr(k)) > Len(IFDaPath) Then IFDaPath = CStr(k)
        End If
    Next k
End Function

Private Function ChiaveIF(ByVal v As Variant) As String
    If IsError(v) Or IsNull(v) Or IsEmpty(v) Then Exit Function
    If IsNumeric(v) And VarType(v) <> vbString Then
        ChiaveIF = Format$(CDbl(v), "0")
    Else
        ChiaveIF = Trim$(CStr(v))
    End If
End Function

' v2.0: End(xlUp) si ferma all'ultima riga VISIBILE; con un filtro attivo
' i controlli avrebbero ignorato le righe in fondo al foglio.
Private Function LeggiDati(ws As Worksheet, ByVal nCols As Long) As Variant
    LeggiDati = LeggiDatiFoglio(ws, nCols)
End Function

' Numero da valore o testo; per i testi con virgola usa la convenzione
' italiana ("1.234,56"), altrimenti la conversione standard
Private Function ToNum(ByVal v As Variant) As Double
    If IsError(v) Or IsNull(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbBoolean Then Exit Function
    If VarType(v) <> vbString Then
        If IsNumeric(v) Then ToNum = CDbl(v)
        Exit Function
    End If
    Dim s As String: s = Trim$(Replace(Replace(CStr(v), "€", ""), " ", ""))
    If s = "" Then Exit Function
    If InStr(s, ",") > 0 Then
        s = Replace(s, ".", "")
        s = Replace(s, ",", Application.International(xlDecimalSeparator))
    End If
    If IsNumeric(s) Then ToNum = CDbl(s)
End Function

Private Function DataValida(ByVal v As Variant) As Boolean
    If IsError(v) Or IsNull(v) Or IsEmpty(v) Then Exit Function
    DataValida = IsDate(v)
End Function

Private Function Nz(ByVal v As Variant) As Variant
    If IsError(v) Or IsNull(v) Then Nz = "" Else Nz = v
End Function

Private Function NuovoDict() As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    Set NuovoDict = d
End Function

Private Function FE(ByVal nome As String) As Boolean
    Dim ws As Object
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nome)
    FE = (Err.Number = 0)
    On Error GoTo 0
End Function
