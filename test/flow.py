import json,urllib.request,base64,sys
codes={c['ten']:c['ma'] for c in json.load(open('/tmp/codes.json'))}
def rpc(fn,*a):
    r=urllib.request.Request('http://localhost:8766/api/rpc',json.dumps({'fn':fn,'args':list(a)}).encode(),{'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r))
def login(t): 
    r=rpc('dangNhap',t,codes[t]); assert r['ok'],r; return r['data']['token']
ok=lambda r,m: print(('OK  ' if r['ok'] else 'FAIL'),m,'' if r['ok'] else r['error'])
p20=login('Phòng giao dịch 20'); th=login('Tổng hợp toàn tỉnh'); nv=login('Cán bộ Nghiệp vụ 2'); pn=login('Phòng Nghiệp vụ 2')
bad=rpc('dangNhap','Phòng giao dịch 20','XXXXXX'); print('sai mã ->',bad['error'])
d=rpc('layDuLieu',p20)['data']; row=d['sheets'][0]['rows'][0]; print('dòng đầu',row['a'],row['b'][:40],row['v'][:9])
# nhập lũy kế cột 5 cao hơn 1000
lk=row['v'][1]; r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':str(lk+1000)}]); ok(r,'lưu lũy kế +1000')
nr=[x for x in r['data']['data']['sheets'][0]['rows'] if x['r']==row['r']][0]; print(' sau lưu',nr['v'][:9], '(trong tháng cũ',row['v'][4],')')
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':8,'v':'5'}]); print('nhập cột tự tính ->',r['data']['loi'])
r=rpc('luu',p20,[{'id':'b01','r':999,'c':5,'v':'5'}]); print('dòng sai ->',r['data']['loi'])
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':'abc'}]); print('không phải số ->',r['data']['loi'])
r=rpc('guiBaoCao',p20); ok(r,'PGD20 gửi BC'); print(' tt',[x['tt'] for x in r['data']['list']])
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':'1'}]); print('sửa sau khi gửi ->',r['error'])
r=rpc('tiepNhan',nv,'Phòng giao dịch 20'); ok(r,'NV2 tiếp nhận')
r=rpc('tiepNhan',nv,'Phòng giao dịch 20'); print('tiếp nhận lần 2 ->',r['error'])
r=rpc('chuyenTra',nv,'Phòng giao dịch 20','Sai số liệu b01'); ok(r,'NV2 chuyển trả')
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':str(lk+500)}]); ok(r,'PGD sửa lại')
rpc('guiBaoCao',p20); rpc('tiepNhan',nv,'Phòng giao dịch 20'); r=rpc('nopTongHop',nv,['Phòng giao dịch 20']); ok(r,'NV2 nộp TH'); print(' soGui',[x['soGui'] for x in r['data']['list'] if x['pgd']=='Phòng giao dịch 20'])
r=rpc('deNghiSua',p20,'Cần điều chỉnh chữ số'); ok(r,'đề nghị điều chỉnh')
r=rpc('chuyenTra',th,'Phòng giao dịch 20','Chuyển trả theo đề nghị'); ok(r,'TH chuyển trả sau nộp')
r=rpc('guiBaoCao',pn); ok(r,'PGD NV2 gửi thẳng'); print(' ',[x['tt'] for x in r['data']['list']])
r=rpc('datHan',th,'2026-11-05T10:00','2026-11-07T16:30'); ok(r,'đặt hạn'); print(' ',r['data']['hanHienThi'])
t=rpc('tongHop',th)['data']; print('tổng hợp: số CĐT PGD20',len(t['list'][4]['cd']),'last',t['list'][4]['last'])
# xuất
for fn,a in [('xuatBieu',(p20,'B01','2026-11-05','',"xlsx",'')),('xuatBieu',(p20,'B03(21-25)','2026-11-05','',"pdf",'')),('xuatBieu',(p20,'BCĐT','2026-11-05','',"xlsx",'')),('xuatTong',(th,'b01','xlsx','')),('xuatTong',(th,'cdt','pdf','')),('xuatThongKe',(th,'xlsx',''))]:
    r=rpc(fn,*a); ok(r,fn+' '+str(a[1] if fn!='xuatThongKe' else ''))
    if r['ok']: open('/tmp/x_'+r['data']['name'].replace('/','_'),'wb').write(base64.b64decode(r['data']['b64']))
# chốt kỳ
r=rpc('lamTron',th); ok(r,'làm tròn'); print(' ',r['data'])
r=rpc('chotKy',th); ok(r,'chốt kỳ'); print(' kỳ',r['data']['ky'],[k['nhan'] for k in r['data']['dsKy']])
d2=rpc('layDuLieu',p20)['data']; r2=d2['sheets'][0]['rows'][0]; print('kỳ 11: lk',r2['v'][:9],'tt',d2['tt'])
d10=rpc('layDuLieu',p20,'*'.replace('*',''),'2026-10')['data']; r10=d10['sheets'][0]['rows'][0]; print('xem kỳ 10:',r10['v'][:9],'kyCu',d10['kyCu'],'tt',d10['tt'])
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':str(lk+600)}]); ok(r,'nhập kỳ 11'); print(' ',[x for x in r['data']['data']['sheets'][0]['rows'] if x['r']==row['r']][0]['v'][:9])
r=rpc('luu',p20,[{'id':'b01','r':row['r'],'c':5,'v':str(lk+300)}],'2026-10'); print('sửa kỳ 10 đã gửi ->',r.get('error'))
