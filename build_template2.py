# -*- coding: utf-8 -*-
import win32com.client as win32
import os

FN = os.path.abspath("fix_자동화.xlsm")
xlWorkbookMacroEnabled = 52

xlYellow = 65535

xl = win32.Dispatch("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False

try:
    wb = xl.Workbooks.Open(FN)
    tpl = wb.Sheets("템플릿")

    # ---------- 2. Fix 합계(sum) row range (now at row 319) ----------
    tpl.Range("C319").Formula = "=SUM(C19:C318)"
    tpl.Range("D319").Formula = "=SUM(D19:D318)"
    tpl.Range("E319").Formula = "=SUM(E19:E318)"
    tpl.Range("G319").Formula = "=SUM(G19:G318)"
    tpl.Range("H319").Formula = "=SUM(H19:H318)"
    tpl.Range("I319").Formula = "=SUM(I19:I318)"

    # ---------- 3. N column period-count label -> formula so it auto-numbers ----------
    tpl.Range("N19").Formula = '=ROW()-18&"기 보수"'
    tpl.Range("N19").AutoFill(Destination=tpl.Range("N19:N318"))

    # ---------- 4. New inputs: 과세유형(C16), 신탁만기 리드타임(C17) ----------
    tpl.Range("B16").Value = "과세유형"
    tpl.Range("C16").Value = "농특세형(0%+1.4%/2.8%)"
    tpl.Range("B17").Value = "신탁만기 리드타임(일)"
    tpl.Range("C17").Value = 11

    # ---------- 5. Generalize 신탁만기일(E8) ----------
    tpl.Range("E8").Formula = "=C8+C17"

    # ---------- 6. Generalize tax formulas (G/H columns), row 19 + steady pattern row 20 ----------
    g_formula = ('=IF($C$16="비과세(0%)",0,'
                 'IF($C$16="표준(소득세14%+지방세)",ROUNDDOWN(F{r}*14%,2),'
                 'ROUNDDOWN(F{r}*0%,-1)))')
    h_formula = ('=IF($C$16="비과세(0%)",0,'
                 'IF($C$16="표준(소득세14%+지방세)",ROUNDDOWN(G{r}*10%,2),'
                 'IF($E$4="개인",F{r}*1.4%,F{r}*2.8%)))')
    g_formula_guarded = '=IF(B{r}="","",' + g_formula[1:] + ')'
    h_formula_guarded = '=IF(B{r}="","",' + h_formula[1:] + ')'

    tpl.Range("G19").Formula = g_formula.format(r=19)
    tpl.Range("H19").Formula = h_formula.format(r=19)
    tpl.Range("G20").Formula = g_formula_guarded.format(r=20)
    tpl.Range("H20").Formula = h_formula_guarded.format(r=20)
    tpl.Range("G20:H20").AutoFill(Destination=tpl.Range("G20:H318"))

    wb.Save()
    print("Stage 2 complete")
finally:
    xl.Quit()
