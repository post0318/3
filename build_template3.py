# -*- coding: utf-8 -*-
import win32com.client as win32
import os

FN = os.path.abspath("fix_자동화.xlsm")

xlBetween = 1
xlValidateList = 3
xlValidAlertStop = 1

xl = win32.gencache.EnsureDispatch("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False

try:
    wb = xl.Workbooks.Open(FN)
    tpl = wb.Sheets("템플릿")
    xl.CutCopyMode = False

    # ---------- fix number formats on the two new input cells ----------
    # Korean Excel COM requires NumberFormatLocal, not NumberFormat, for locale-word formats.
    for addr, fmt in [("B16", "G/표준"), ("B17", "G/표준"),
                       ("C16", "G/표준"), ("C17", "0")]:
        try:
            tpl.Range(addr).NumberFormatLocal = fmt
        except Exception as e:
            print(f"NumberFormat failed for {addr}: {e}")
    tpl.Range("C17").Value = 11  # re-set now that format is correct

    # ---------- clear bond-specific values -> blank required inputs ----------
    tpl.Range("C6").Value = ""    # 종목명
    tpl.Range("C7").Value = ""    # 발행일
    tpl.Range("C8").Value = ""    # 만기일
    tpl.Range("C9").Value = ""    # 표면이율
    tpl.Range("C11").Value = ""   # 해외신용등급
    tpl.Range("E12").Value = ""   # 매수금리(YTM)

    # ---------- sensible defaults for the rest ----------
    tpl.Range("C3").Value = "미국 30/360"
    tpl.Range("C4").Value = 1300
    tpl.Range("C10").Value = "6개월"
    tpl.Range("C12").Value = "USD"
    tpl.Range("C13").Value = "USD"
    tpl.Range("E4").Value = "개인"
    tpl.Range("E7").Formula = "=TODAY()"   # 신탁계약일
    tpl.Range("I7").Value = 1000000        # 고객입금액
    tpl.Range("G6").Value = 0.01           # 선취보수율
    tpl.Range("G8").Value = 0.005          # 후취보수율

    # ---------- data validation dropdowns ----------
    def set_list_validation(addr, list_formula):
        rng = tpl.Range(addr)
        try:
            rng.Validation.Delete()
        except Exception:
            pass
        rng.Validation.Add(Type=xlValidateList, AlertStyle=xlValidAlertStop,
                            Operator=xlBetween, Formula1=list_formula)

    set_list_validation("C3", "=$N$7:$N$11")
    set_list_validation("C10", "=$O$7:$O$9")
    set_list_validation("C12", "=$P$7:$P$11")
    set_list_validation("C13", "=$P$7:$P$11")
    set_list_validation("E4", "=$M$6:$M$8")
    set_list_validation("C16", '농특세형(0%+1.4%/2.8%),표준(소득세14%+지방세),비과세(0%)')

    # ---------- highlight required-input cells ----------
    required = ["C6", "C7", "C8", "C9", "E12"]
    for addr in required:
        tpl.Range(addr).Interior.Color = 65535  # yellow

    wb.Save()
    print("Stage 3 complete")
finally:
    xl.Quit()
