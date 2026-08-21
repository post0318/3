# -*- coding: utf-8 -*-
import win32com.client as win32
import os

SRC = os.path.abspath("fix.xlsx")
OUT = os.path.abspath("fix_자동화.xlsm")

xlWorkbookMacroEnabled = 52  # xlOpenXMLWorkbookMacroEnabled
xlUp = -4162
xlDown = -4121

xl = win32.Dispatch("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False

try:
    wb = xl.Workbooks.Open(SRC)

    src_sheet = wb.Sheets("한국전력_USD")
    src_sheet.Copy(Before=wb.Sheets(1))
    tpl = wb.Sheets(1)
    tpl.Name = "템플릿"

    # ---------- 1. Insert extra schedule rows ----------
    # Current layout: rows 19-162 = periods, 163 = 합계, 165-175 = 안내문구
    # Target: rows 19-318 = periods (300 periods), 319 = 합계, 321-331 = 안내문구
    N_EXTRA = 318 - 162  # 156
    insert_range = tpl.Range(f"A163:A{163 + N_EXTRA - 1}")
    insert_range.EntireRow.Insert()

    # Fill formulas down from the steady-state row (originally row20, unaffected by insert
    # since insert happened below it) through the new rows up to 318.
    fill_src = tpl.Range("B20:T20")
    fill_dest = tpl.Range("B20:T318")
    fill_dest.FillDown()

    print("Row insert + filldown OK. tpl.UsedRange:", tpl.UsedRange.Address)

    wb.SaveAs(OUT, FileFormat=xlWorkbookMacroEnabled)
    print("Saved intermediate:", OUT)
finally:
    xl.Quit()
