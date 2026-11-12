import json
from playwright.sync_api import sync_playwright
codes={c['ten']:c['ma'] for c in json.load(open('/tmp/codes.json'))}
def login(pg,t):
    pg.goto('http://localhost:8766/cv1953/');pg.wait_for_timeout(600)
    pg.select_option('#lgPgd',label=t) if pg.query_selector('#lgPgd').evaluate('e=>e.tagName')=='SELECT' else pg.fill('#lgPgd',t)
    pg.fill('#lgMa',codes[t]);pg.keyboard.press('Enter');pg.wait_for_timeout(1500)
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_context(viewport={'width':1366,'height':800}).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8766/cv1953/');pg.wait_for_timeout(1200);pg.screenshot(path='/tmp/v_login.png')
    login(pg,'Phòng giao dịch 22');pg.screenshot(path='/tmp/v_tq.png')
    pg.click('nav button:nth-child(2)');pg.wait_for_timeout(1500);pg.screenshot(path='/tmp/v_b01.png')
    inp=pg.query_selector('td input[data-k]');print('inputs',len(pg.query_selector_all('td input[data-k]')))
    login(pg,'Tổng hợp toàn tỉnh');pg.screenshot(path='/tmp/v_th.png');print(errs);b.close()
