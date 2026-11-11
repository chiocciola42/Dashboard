Attribute VB_Name = "Mod_Anagrafica"
Option Explicit

' =====================================================================
'  AGGREGATORE - Mod_Anagrafica v1.0 (rilascio 5.0)
'  Foglio "Anagrafica IF": gli attributi inseriti a mano (Ambito,
'  Attivazione immediata, Note) hanno come chiave il Numero IF e
'  sopravvivono alle aggregazioni.
'
'  Colonne:
'    A Numero IF               chiave (scritta dalla macro)
'    B Titolo Intervento       formula: letto da "Generalità Intervento"
'    C Ambito                  MANUALE
'    D Attivazione immediata   MANUALE (SI / NO)
'    E Note                    MANUALE
'    F Stato                   formula: "Attiva" / "Non più in Generalità"
'
'  REGOLE
'    - AggregaModuli chiama SincronizzaAnagrafica dopo ogni scrittura:
'      le IF nuove vengono accodate con Ambito vuoto. Nessuna riga viene
'      mai modificata o eliminata dalla macro.
'    - Un'IF senza Ambito e' segnalata da "Controlli Qualità" (controllo
'      12) invece di finire in silenzio come "Non classificato" nella dashboard.
'    - ImportaDaAmbiti copia la classificazione presente nel foglio storico
'      "Ambiti": aggiunge le IF mancanti e completa Ambito / Attivazione
'      lasciati vuoti; un valore gia' compilato non viene mai sovrascritto.
' =====================================================================

Private Const SH_GEN As String = "Generalità Intervento"
Private Const SH_AMBITI As String = "Ambiti"
Private Const nCol As Long = 6

Private Function FoglioAnagrafica() As Worksheet
    Set FoglioAnagrafica = AssicuraFoglio(SH_ANAGRAFICA, Array("Numero IF", "Titolo Intervento", _
                           "Ambito", "Attivazione immediata", "Note", "Stato"))
End Function

' Accoda le IF presenti in Generalita' e assenti in anagrafica.
' Restituisce il numero di IF aggiunte (-1 in caso di errore).
Public Function SincronizzaAnagrafica() As Long
    Dim ws As Worksheet, presenti As Object, vG As Variant, i As Long, k As String
    Dim r As Long, aggiunte As Long
    On Error GoTo errore

    Set ws = FoglioAnagrafica()
    MostraTutto ws
    Set presenti = ChiaviPresenti(ws)

    vG = LeggiDatiFoglio(ThisWorkbook.Worksheets(SH_GEN), 3)
    r = UltimaRigaDati(ws, nCol)
    If IsArray(vG) Then
        For i = 1 To UBound(vG, 1)
            k = ChiaveNumeroIF(vG(i, 3))
            If k <> "" Then
                If Not presenti.Exists(k) Then
                    presenti.Add k, True
                    r = r + 1
                    ScriviRiga ws, r, k, Empty, Empty
                    aggiunte = aggiunte + 1
                End If
            End If
        Next i
    End If
    AssicuraTabella ws, TBL_ANAGRAFICA, r - 1, nCol
    SincronizzaAnagrafica = aggiunte
    Exit Function
errore:
    SincronizzaAnagrafica = -1
End Function

' Copia Ambito e Attivazione immediata dal foglio storico "Ambiti"
' (tabella con le colonne "Numero IF", "Ambito", "Attivazione immediata").
' Le IF mancanti in anagrafica vengono aggiunte; per quelle gia' presenti si
' compilano solo Ambito / Attivazione vuoti (mai sovrascritti).
' Restituisce il numero di IF aggiunte o completate (-1 in caso di errore).
Public Function ImportaDaAmbiti() As Long
    Dim ws As Worksheet, wsOld As Worksheet, presenti As Object, v As Variant
    Dim cIF As Long, cAmb As Long, cAtt As Long, i As Long, j As Long, r As Long
    Dim k As String, attivazione As Variant, importate As Long
    On Error GoTo errore

    If Not FoglioPresente(SH_AMBITI) Then Exit Function
    Set wsOld = ThisWorkbook.Worksheets(SH_AMBITI)
    If wsOld.ListObjects.Count = 0 Then Exit Function
    v = wsOld.ListObjects(1).Range.Value
    If Not IsArray(v) Then Exit Function
    For j = 1 To UBound(v, 2)
        If Not IsError(v(1, j)) Then
            Select Case LCase$(Trim$(CStr(v(1, j))))
                Case "numero if": cIF = j
                Case "ambito": cAmb = j
                Case "attivazione immediata": cAtt = j
            End Select
        End If
    Next j
    If cIF = 0 Or cAmb = 0 Then Exit Function

    Set ws = FoglioAnagrafica()
    MostraTutto ws
    Set presenti = ChiaviPresenti(ws)
    r = UltimaRigaDati(ws, nCol)
    For i = 2 To UBound(v, 1)
        k = ChiaveNumeroIF(v(i, cIF))
        If k <> "" Then
            attivazione = Empty
            If cAtt > 0 Then attivazione = v(i, cAtt)
            If Not presenti.Exists(k) Then
                r = r + 1
                presenti.Add k, r
                ScriviRiga ws, r, k, v(i, cAmb), attivazione
                importate = importate + 1
            Else
                importate = importate + CompletaRiga(ws, CLng(presenti(k)), v(i, cAmb), attivazione)
            End If
        End If
    Next i
    AssicuraTabella ws, TBL_ANAGRAFICA, r - 1, nCol
    ImportaDaAmbiti = importate
    Exit Function
errore:
    ImportaDaAmbiti = -1
End Function

' Compila Ambito (colonna C) e Attivazione (colonna D) della riga solo se vuoti.
' Restituisce 1 se ha scritto qualcosa, altrimenti 0.
Private Function CompletaRiga(ws As Worksheet, ByVal riga As Long, _
                              ByVal ambito As Variant, ByVal attivazione As Variant) As Long
    If riga < 2 Then Exit Function
    If Not IsError(ambito) And Not IsEmpty(ambito) Then
        If Len(Trim$(CStr(ambito))) > 0 And Len(Trim$(CStr(ws.Cells(riga, 3).Value))) = 0 Then
            ws.Cells(riga, 3).Value = ambito
            CompletaRiga = 1
        End If
    End If
    If Not IsError(attivazione) And Not IsEmpty(attivazione) Then
        If Len(Trim$(CStr(attivazione))) > 0 And Len(Trim$(CStr(ws.Cells(riga, 4).Value))) = 0 Then
            ws.Cells(riga, 4).Value = attivazione
            CompletaRiga = 1
        End If
    End If
End Function

Private Function ChiaviPresenti(ws As Worksheet) As Object
    Dim d As Object, v As Variant, i As Long, k As String
    Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    v = LeggiDatiFoglio(ws, 1)
    If IsArray(v) Then
        For i = 1 To UBound(v, 1)
            k = ChiaveNumeroIF(v(i, 1))
            If k <> "" Then
                If Not d.Exists(k) Then d.Add k, CLng(i + 1)
            End If
        Next i
    End If
    Set ChiaviPresenti = d
End Function

Private Sub ScriviRiga(ws As Worksheet, ByVal r As Long, ByVal numIF As String, _
                       ByVal ambito As Variant, ByVal attivazione As Variant)
    ' Numero IF come numero, come nella colonna C di Generalita' (CONFRONTA)
    If IsNumeric(numIF) Then ws.Cells(r, 1).Value = CDbl(numIF) Else ws.Cells(r, 1).Value = numIF
    ws.Cells(r, 2).Formula = "=IFERROR(INDEX('" & SH_GEN & "'!$B:$B,MATCH($A" & r & ",'" & SH_GEN & "'!$C:$C,0)),"""")"
    If Not IsError(ambito) Then
        If Not IsEmpty(ambito) Then ws.Cells(r, 3).Value = ambito
    End If
    If Not IsError(attivazione) Then
        If Not IsEmpty(attivazione) Then ws.Cells(r, 4).Value = attivazione
    End If
    ws.Cells(r, 6).Formula = "=IF(ISNUMBER(MATCH($A" & r & ",'" & SH_GEN & "'!$C:$C,0)),""Attiva"",""Non più in Generalità"")"
End Sub
