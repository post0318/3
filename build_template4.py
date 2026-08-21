# -*- coding: utf-8 -*-
import win32com.client as win32
import os

FN = os.path.abspath("fix_자동화.xlsm")
vbext_ct_StdModule = 1

VBA_CODE = '''Option Explicit

Function SanitizeSheetName(ByVal s As String) As String
    Dim bad As Variant, i As Integer
    bad = Array("\\", "/", "?", "*", "[", "]", ":")
    For i = LBound(bad) To UBound(bad)
        s = Replace(s, bad(i), "_")
    Next i
    s = Trim(s)
    If Len(s) > 28 Then s = Left(s, 28)
    If Len(s) = 0 Then s = "채권"
    SanitizeSheetName = s
End Function

Function UniqueSheetName(ByVal base As String) As String
    Dim nm As String, i As Integer, exists As Boolean, ws As Worksheet
    nm = base
    i = 1
    Do
        exists = False
        For Each ws In ThisWorkbook.Worksheets
            If ws.Name = nm Then
                exists = True
                Exit For
            End If
        Next ws
        If Not exists Then Exit Do
        i = i + 1
        nm = Left(base, 28) & "_" & i
    Loop
    UniqueSheetName = nm
End Function

Sub CreateSnapshot()
    Dim src As Worksheet, newSh As Worksheet
    Dim bondName As String, newName As String
    Dim shp As Shape

    Set src = ThisWorkbook.Sheets("템플릿")

    If Trim(src.Range("C6").Value) = "" Or _
       Not IsDate(src.Range("C7").Value) Or _
       Not IsDate(src.Range("C8").Value) Or _
       src.Range("C9").Value = "" Or _
       src.Range("E12").Value = "" Then
        MsgBox "종목명, 발행일, 만기일, 표면이율, 매수금리(YTM)를 모두 입력한 후 실행해주세요.", vbExclamation, "입력 필요"
        Exit Sub
    End If

    bondName = CStr(src.Range("C6").Value)
    newName = UniqueSheetName(SanitizeSheetName(bondName))

    Application.ScreenUpdating = False
    src.Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
    Set newSh = ActiveSheet
    newSh.Name = newName

    With newSh.UsedRange
        .Value = .Value
    End With

    For Each shp In newSh.Shapes
        shp.Delete
    Next shp

    newSh.Range("A1").Select
    Application.ScreenUpdating = True

    MsgBox "'" & newName & "' 시트에 현금흐름이 저장되었습니다.", vbInformation, "완료"
End Sub
'''

xl = win32.gencache.EnsureDispatch("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False

try:
    wb = xl.Workbooks.Open(FN)
    tpl = wb.Sheets("템플릿")

    vbproj = wb.VBProject
    # remove existing module of same name if re-running this script
    for comp in list(vbproj.VBComponents):
        if comp.Name == "BondAutomation":
            vbproj.VBComponents.Remove(comp)

    mod = vbproj.VBComponents.Add(vbext_ct_StdModule)
    mod.Name = "BondAutomation"
    mod.CodeModule.AddFromString(VBA_CODE)

    # remove any pre-existing buttons on 템플릿 (idempotent re-run)
    for shp in list(tpl.Shapes):
        if shp.Type == 8 or "Button" in shp.Name:  # msoFormControl-ish guard
            try:
                shp.Delete()
            except Exception:
                pass

    left = tpl.Range("K1").Left
    top = tpl.Range("K1").Top
    btn = tpl.Buttons().Add(left, top, 230, 40)
    btn.OnAction = "CreateSnapshot"
    btn.Caption = "채권 확정 -> 새 시트 생성"

    wb.Save()
    print("Stage 4 complete")
finally:
    xl.Quit()
