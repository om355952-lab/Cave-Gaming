/* script.js - متكامل: جلسات، ثيمات، منتجات، فواتير، admin - localStorage */
const STORE_KEY = 'cave_v2_state';

// ====== Default state ======
const defaultState = {
  prices: {
    ps5_match: 35, ps5_hour: 60,
    ps4_match: 25, ps4_hour: 45,
    billiard_pool: 50, billiard_snooker: 60, billiard_hour: 40,
    tennis_single: 40, tennis_double: 60
  },
  rooms: [
    { id:'ps5_1', name:'PS5 1', type:'ps5' },
    { id:'ps4_1', name:'PS4 1', type:'ps4' },
    { id:'bil_1', name:'ترابيزة 1', type:'billiard', sub:'pool' },
    { id:'ten_1', name:'طاولة 1', type:'tennis', sub:'single' }
  ],
  products:[
    { id:'p1', name:'بيبسي', sellPrice:20, wholesalePrice:12, stock:50},
    { id:'p2', name:'سندوتش', sellPrice:35, wholesalePrice:25, stock:30}
  ],
  sessions: [], // active and old sessions
  invoices: [],
  theme: 'gold' // gold, purple, neon
};

// load/save
function load(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) { localStorage.setItem(STORE_KEY, JSON.stringify(defaultState)); return JSON.parse(JSON.stringify(defaultState)); }
    return JSON.parse(raw);
  } catch(e){ console.error(e); localStorage.setItem(STORE_KEY, JSON.stringify(defaultState)); return JSON.parse(JSON.stringify(defaultState)); }
}
function save(state){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

// helpers
function uid(pref='id'){ return pref + '_' + Math.random().toString(36).slice(2,9); }
function now(){ return Date.now(); }
function fmtMs(ms){ const s = Math.floor(ms/1000); const hh = Math.floor(s/3600), mm = Math.floor((s%3600)/60), ss = s%60; const p=n=>String(n).padStart(2,'0'); return `${p(hh)}:${p(mm)}:${p(ss)}`; }

// state in memory
let state = load();

// theme apply
function applyTheme(){
  document.body.classList.remove('theme-gold','theme-purple','theme-neon');
  if(state.theme==='gold') document.body.classList.add('theme-gold');
  if(state.theme==='purple') document.body.classList.add('theme-purple');
  if(state.theme==='neon') document.body.classList.add('theme-neon');
}
applyTheme();

// ====== Sessions logic ======
// session object: {id, roomId, startedAt, accMs, stoppedAt(null if running), items:[], presetMinutes:null, mode }
function startSession(roomId, presetMinutes=0, startOffsetMin=0, mode=null){
  const running = state.sessions.find(s=> s.roomId===roomId && !s.stoppedAt && !s.endedAt);
  if(running) return alert('يوجد جلسة شغالة لهذه الغرفة بالفعل.');
  const s = { id: uid('S'), roomId, startedAt: now() - (startOffsetMin*60000), accMs:0, stoppedAt:null, endedAt:null, items:[], alarmMs:null, _fired:false, presetMinutes: presetMinutes>0? presetMinutes : null, mode };
  state.sessions.push(s); save(state); renderAll();
}

function startSessionWithStartTime(roomId, startTimeStr, mode=null){
  // startTimeStr format "HH:MM"
  if(!startTimeStr) return startSession(roomId,0,0,mode);
  const parts = startTimeStr.split(':').map(Number);
  if(parts.length<2) return startSession(roomId,0,0,mode);
  const nowDate = new Date();
  const startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), parts[0], parts[1], 0, 0);
  // If startDate in future assume previous day (entered past midnight)
  if(startDate.getTime() > nowDate.getTime()){
    // subtract one day
    startDate.setDate(startDate.getDate() -1);
  }
  const offsetMin = Math.floor((nowDate - startDate)/60000);
  startSession(roomId, 0, offsetMin, mode);
}

function pauseSession(sessionId){
  const s = state.sessions.find(x=> x.id===sessionId); if(!s || s.stoppedAt) return;
  s.stoppedAt = now(); s.accMs = (s.accMs||0) + (s.stoppedAt - s.startedAt); save(state); renderAll();
}
function resumeSession(sessionId){
  const s = state.sessions.find(x=> x.id===sessionId); if(!s) return;
  if(!s.stoppedAt) return;
  s.startedAt = now(); s.stoppedAt = null; save(state); renderAll();
}
function endSession(sessionId){
  const s = state.sessions.find(x=> x.id===sessionId); if(!s) return;
  if(!s.stoppedAt){ s.stoppedAt = now(); s.accMs = (s.accMs||0) + (s.stoppedAt - s.startedAt); }
  s.endedAt = now();
  const room = state.rooms.find(r=> r.id===s.roomId);
  const perHour = computePricePerHour(room, s.mode);
  const minutes = Math.ceil((s.accMs || 0)/60000);
  const timeCost = Math.round(((perHour/60)*minutes) * 100)/100;
  const prodCost = Math.round((s.items||[]).reduce((a,b)=> a + (b.sellPrice*b.qty),0) * 100)/100;
  const total = Math.round((timeCost + prodCost) * 100)/100;
  const inv = { id: uid('INV'), sessionId: s.id, roomId: s.roomId, t: now(), timeMin: minutes, timeCost, prodCost, total, items: s.items||[] };
  state.invoices.push(inv);
  save(state); renderAll(); showInvoice(inv);
}

// compute price per hour based on room & mode
function computePricePerHour(room, mode){
  const p = state.prices || (state.prices = (defaultState.prices));
  if(!room) return 0;
  if(room.type==='ps5'){
    if(mode==='match') return p.ps5_match || p.ps5_hour || 0;
    return p.ps5_hour || 0;
  }
  if(room.type==='ps4'){
    if(mode==='match') return p.ps4_match || p.ps4_hour || 0;
    return p.ps4_hour || 0;
  }
  if(room.type==='billiard'){
    if(mode==='snooker') return p.billiard_snooker || p.billiard_pool || p.billiard_hour || 0;
    return p.billiard_pool || p.billiard_hour || 0;
  }
  if(room.type==='tennis'){
    if(mode==='double') return p.tennis_double || p.tennis_single || 0;
    return p.tennis_single || 0;
  }
  return 0;
}

// products logic
function addProduct(name, sellPrice, wholesalePrice, stock){
  const p = { id: uid('P'), name, sellPrice: Number(sellPrice||0), wholesalePrice: Number(wholesalePrice||0), stock: Number(stock||0) };
  state.products.push(p); save(state); renderAll();
}
function deleteProduct(id){ if(!confirm('حذف المنتج؟')) return; state.products = state.products.filter(p=> p.id!==id); save(state); renderAll(); }
function sellProductStandalone(productId, qty=1){
  const product = state.products.find(x=> x.id===productId); if(!product) return alert('منتج غير موجود');
  qty = Number(qty||1);
  if(product.stock !== undefined && product.stock < qty) return alert('المخزون لا يكفي');
  if(product.stock !== undefined) product.stock -= qty;
  const total = Math.round(product.sellPrice * qty * 100)/100;
  const inv = { id: uid('INV'), sessionId:null, roomId:null, t: now(), timeMin:0, timeCost:0, prodCost: total, total, items:[{ id: uid('ITM'), productId:product.id, name:product.name, qty, sellPrice:product.sellPrice }] };
  state.invoices.push(inv); save(state); renderAll(); showInvoice(inv);
}
function addProductToSession(sessionId, productId, qty=1){
  const s = state.sessions.find(x=> x.id===sessionId); if(!s) return alert('جلسة غير موجودة');
  const p = state.products.find(x=> x.id===productId); if(!p) return alert('منتج غير موجود');
  qty = Number(qty||1);
  if(p.stock !== undefined && p.stock < qty) return alert('المخزون لا يكفي');
  p.stock -= qty;
  s.items.push({ id: uid('CI'), productId: p.id, name: p.name, sellPrice: p.sellPrice, qty });
  save(state); renderAll();
}
function removeItemFromSession(sessionId, itemId){
  const s = state.sessions.find(x=> x.id===sessionId); if(!s) return;
  const it = s.items.find(i=> i.id===itemId); if(it){
    const p = state.products.find(x=> x.id===it.productId); if(p) p.stock += it.qty;
  }
  s.items = s.items.filter(i=> i.id!==itemId); save(state); renderAll();
}

// invoice show (modal)
function showInvoice(inv){
  const modal = document.createElement('div'); modal.className='modal-backdrop';
  modal.innerHTML = `
    <div class="invoice-modal">
      <div class="invoice-header">
        <div><h3>فاتورة — ${inv.id}</h3><div class="small">${new Date(inv.t).toLocaleString()}</div></div>
        <div><button class="btn btn-ghost" id="closeInv">إغلاق</button></div>
      </div>
      <div style="margin-top:10px">الغرفة: <strong>${inv.roomId||'بيع مستقل'}</strong></div>
      <div>المدة: <strong>${inv.timeMin||0} دقيقة</strong></div>
      <div class="invoice-items">
        ${(inv.items || []).map(it=>`<div style="display:flex;justify-content:space-between;padding:6px 0">${it.name} x${it.qty} <strong>${((it.sellPrice || it.price || 0) * (it.qty||1)).toFixed(2)} ج</strong></div>`).join('')}
      </div>
      <div class="invoice-footer">
        <div>تكلفة الوقت: <strong>${(inv.timeCost||0).toFixed(2)} ج</strong></div>
        <div>تكلفة المنتجات: <strong>${(inv.prodCost||0).toFixed(2)} ج</strong></div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:900;font-size:18px">الإجمالي: ${(inv.total||0).toFixed(2)} ج</div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary" id="printInv">طباعة</button><button class="btn btn-ghost" id="closeInv2">إغلاق</button></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('closeInv').onclick = ()=> modal.remove();
  document.getElementById('closeInv2').onclick = ()=> modal.remove();
  document.getElementById('printInv').onclick = ()=> {
    const w = window.open('','_blank','width=700,height=900');
    w.document.write(`<html><head><meta charset="utf-8"><title>فاتورة ${inv.id}</title></head><body style="font-family:Arial;padding:18px">${modal.querySelector('.invoice-modal').innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };
}

// render helpers for pages
function renderPlaystationPage(){
  const el = document.getElementById('play-rooms'); if(!el) return;
  el.innerHTML = '';
  const rooms = state.rooms.filter(r=> r.type==='ps5' || r.type==='ps4');
  rooms.forEach(r=>{
    const active = state.sessions.find(s=> s.roomId===r.id && !s.stoppedAt && !s.endedAt);
    const paused = state.sessions.find(s=> s.roomId===r.id && s.stoppedAt && !s.endedAt);
    const elapsed = active? ((now()-active.startedAt) + (active.accMs||0)) : (paused? (paused.accMs||0) : 0);
    const minutes = Math.ceil(elapsed/60000);
    const circ = 2*Math.PI*46;
    const svgId = 'ring_'+r.id;
    const dash = ((1 - 0) * circ).toFixed(2);
    const priceNow = ((computePricePerHour(r, active?active.mode:null)/60)*minutes).toFixed(2);
    const card = document.createElement('div'); card.className='card room';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h3>${r.name} — ${r.type.toUpperCase()}</h3>
          <div class="muted">${r.sub? r.sub : ''}</div>
          <div style="margin-top:6px">الحالة: ${active?'<strong style="color:#ff8b8b">مشغول</strong>':(paused?'<strong style="color:#ffd77a">موقوف</strong>':'<strong style="color:#9ff6c6">متاح</strong>')}</div>
        </div>
        <div class="timer-wrap" style="margin-left:auto">
          <div class="timer-svg">
            <svg width="110" height="110" viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="46" stroke="rgba(255,255,255,0.04)" stroke-width="10" fill="none"></circle>
              <circle id="${svgId}" data-circ="${circ}" cx="55" cy="55" r="46" stroke="${active? '#ff6b6b' : 'var(--accent1)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${dash}"></circle>
            </svg>
            <div class="timer-center" id="time_${r.id}">${active? fmtMs(elapsed) : (paused? fmtMs(elapsed) : '00:00:00')}</div>
          </div>
          <div style="min-width:160px">
            <div style="margin-bottom:8px">المبلغ الآن: <strong id="price_${r.id}" class="price">${priceNow} ج</strong></div>
            <div class="controls">
              <button class="btn btn-primary" onclick="openStartDialog('${r.id}','ps')">${active? 'تعديل/استئناف' : 'بدء'}</button>
              <button class="btn btn-ghost" onclick="quickPauseResume('${r.id}')">${active? 'إيقاف مؤقت' : (paused? 'استئناف' : '—')}</button>
              <button class="btn btn-ghost" onclick="openAddProductToRoomPrompt('${r.id}')">أضف منتج</button>
              <button class="btn btn-ghost" onclick="openCheckout('${r.id}')">تحصيل</button>
            </div>
          </div>
        </div>
      </div>
      <div id="cart_${r.id}" class="cart-list">${renderCartHtmlForRoom(r.id)}</div>
    `;
    el.appendChild(card);
  });
}

function renderBilliardPage(){
  const el = document.getElementById('billiard-rooms'); if(!el) return;
  el.innerHTML = '';
  const rooms = state.rooms.filter(r=> r.type==='billiard' || r.type==='snooker');
  rooms.forEach(r=>{
    const active = state.sessions.find(s=> s.roomId===r.id && !s.stoppedAt && !s.endedAt);
    const paused = state.sessions.find(s=> s.roomId===r.id && s.stoppedAt && !s.endedAt);
    const elapsed = active? ((now()-active.startedAt) + (active.accMs||0)) : (paused? (paused.accMs||0) : 0);
    const circ = 2*Math.PI*46;
    const svgId = 'ring_'+r.id;
    const priceNow = ((computePricePerHour(r, active?active.mode:null)/60)*Math.ceil(elapsed/60000)).toFixed(2);
    const card = document.createElement('div'); card.className='card room';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>${r.name} — ${r.sub||''}</h3><div class="muted">${r.type}</div></div>
        <div class="timer-wrap" style="margin-left:auto">
          <div class="timer-svg"><svg width="110" height="110" viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" stroke="rgba(255,255,255,0.04)" stroke-width="10" fill="none"></circle><circle id="${svgId}" data-circ="${circ}" cx="55" cy="55" r="46" stroke="var(--accent2)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle></svg><div class="timer-center" id="time_${r.id}">${active? fmtMs(elapsed) : (paused? fmtMs(elapsed) : '00:00:00')}</div></div>
          <div style="min-width:160px"><div>المبلغ الآن: <strong id="price_${r.id}" class="price">${priceNow} ج</strong></div><div class="controls"><button class="btn btn-primary" onclick="openStartDialog('${r.id}','billiard')">بدء</button><button class="btn btn-ghost" onclick="quickPauseResume('${r.id}')">إيقاف/استئناف</button><button class="btn btn-ghost" onclick="openAddProductToRoomPrompt('${r.id}')">أضف منتج</button><button class="btn btn-ghost" onclick="openCheckout('${r.id}')">تحصيل</button></div></div>
        </div>
      </div>
      <div id="cart_${r.id}" class="cart-list">${renderCartHtmlForRoom(r.id)}</div>
    `;
    el.appendChild(card);
  });
}

function renderTennisPage(){
  const el = document.getElementById('tennis-rooms'); if(!el) return;
  el.innerHTML = '';
  const rooms = state.rooms.filter(r=> r.type==='tennis');
  rooms.forEach(r=>{
    const active = state.sessions.find(s=> s.roomId===r.id && !s.stoppedAt && !s.endedAt);
    const paused = state.sessions.find(s=> s.roomId===r.id && s.stoppedAt && !s.endedAt);
    const elapsed = active? ((now()-active.startedAt) + (active.accMs||0)) : (paused? (paused.accMs||0) : 0);
    const circ = 2*Math.PI*46;
    const svgId = 'ring_'+r.id;
    const priceNow = ((computePricePerHour(r, active?active.mode:null)/60)*Math.ceil(elapsed/60000)).toFixed(2);
    const card = document.createElement('div'); card.className='card room';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>${r.name} — ${r.sub||''}</h3><div class="muted">${r.type}</div></div>
        <div class="timer-wrap" style="margin-left:auto">
          <div class="timer-svg"><svg width="110" height="110" viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" stroke="rgba(255,255,255,0.04)" stroke-width="10" fill="none"></circle><circle id="${svgId}" data-circ="${circ}" cx="55" cy="55" r="46" stroke="var(--accent1)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"></circle></svg><div class="timer-center" id="time_${r.id}">${active? fmtMs(elapsed) : (paused? fmtMs(elapsed) : '00:00:00')}</div></div>
          <div style="min-width:160px"><div>المبلغ الآن: <strong id="price_${r.id}" class="price">${priceNow} ج</strong></div><div class="controls"><button class="btn btn-primary" onclick="openStartDialog('${r.id}','tennis')">بدء</button><button class="btn btn-ghost" onclick="quickPauseResume('${r.id}')">إيقاف/استئناف</button><button class="btn btn-ghost" onclick="openAddProductToRoomPrompt('${r.id}')">أضف منتج</button><button class="btn btn-ghost" onclick="openCheckout('${r.id}')">تحصيل</button></div></div>
        </div>
      </div>
      <div id="cart_${r.id}" class="cart-list">${renderCartHtmlForRoom(r.id)}</div>
    `;
    el.appendChild(card);
  });
}

// cart renderer for a room (active or paused)
function renderCartHtmlForRoom(roomId){
  const s = state.sessions.find(x=> x.roomId===roomId && !x.endedAt);
  if(!s) return `<div style="color:#9aa8b3">لا توجد منتجات</div>`;
  const items = s.items||[];
  if(items.length===0) return `<div style="color:#9aa8b3">لا توجد منتجات</div>`;
  return items.map(it=>`<div class="cart-item"><div>${it.name} x${it.qty} <strong>${(it.sellPrice*it.qty).toFixed(2)} ج</strong></div><div><button class="btn btn-ghost btn-small" onclick="removeItemFromSession('${s.id}','${it.id}')">حذف</button></div></div>`).join('');
}

// admin render
function renderAdmin(){
  const el = document.getElementById('admin-rooms'); if(el){
    el.innerHTML = '';
    state.rooms.forEach(r=>{
      const d = document.createElement('div'); d.className='card'; d.style.marginBottom='8px';
      d.innerHTML = `<strong>${r.type.toUpperCase()} — ${r.name}</strong><div style="margin-top:6px"><button class="btn btn-ghost" onclick="deleteRoom('${r.id}')">حذف</button></div>`;
      el.appendChild(d);
    });
  }
  const ap = document.getElementById('admin-products'); if(ap){
    ap.innerHTML = '';
    state.products.forEach(p=>{
      const d = document.createElement('div'); d.className='card'; d.style.marginBottom='8px';
      d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${p.name}</strong><div class="small">${p.sellPrice} ج — جملة:${p.wholesalePrice||'-'} — مخزون: ${p.stock}</div></div><div><button class="btn btn-ghost" onclick="deleteProduct('${p.id}')">حذف</button></div></div>`;
      ap.appendChild(d);
    });
  }
  if(document.getElementById('price-ps5')) document.getElementById('price-ps5').value = state.prices.ps5_hour;
  if(document.getElementById('price-ps4')) document.getElementById('price-ps4').value = state.prices.ps4_hour;
  if(document.getElementById('price-ps5m')) document.getElementById('price-ps5m').value = state.prices.ps5_match;
  if(document.getElementById('price-ps4m')) document.getElementById('price-ps4m').value = state.prices.ps4_match;
  if(document.getElementById('price-b')) document.getElementById('price-b').value = state.prices.billiard_pool;
  if(document.getElementById('price-s')) document.getElementById('price-s').value = state.prices.billiard_snooker;
  if(document.getElementById('price-t1')) document.getElementById('price-t1').value = state.prices.tennis_single;
  if(document.getElementById('price-t2')) document.getElementById('price-t2').value = state.prices.tennis_double;
}

// products page render
function renderProductsPage(){
  const el = document.getElementById('products-list'); if(!el) return;
  el.innerHTML = '';
  state.products.forEach(p=>{
    const d = document.createElement('div'); d.className='card';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${p.name}</strong><div class="small">${p.sellPrice} ج — جملة:${p.wholesalePrice||'-'} — مخزون:${p.stock}</div></div><div style="display:flex;flex-direction:column;gap:8px"><button class="btn btn-primary" onclick="sellProductStandalonePrompt('${p.id}')">بيع</button><button class="btn btn-ghost" onclick="deleteProduct('${p.id}')">حذف</button></div></div>`;
    el.appendChild(d);
  });
}

// invoices render
function renderInvoices(){
  const el = document.getElementById('invoiceList'); if(!el) return;
  el.innerHTML = '';
  state.invoices.slice().reverse().forEach(inv=>{
    const d = document.createElement('div'); d.className='card'; d.style.marginBottom='8px';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>فاتورة ${inv.id}</strong><div class="small">${new Date(inv.t).toLocaleString()}</div></div><div><strong>${inv.total} ج</strong></div></div><div style="margin-top:8px"><button class="btn btn-ghost" onclick="showInvoiceFromData('${inv.id}')">عرض/طباعة</button></div>`;
    el.appendChild(d);
  });
}

function showInvoiceFromData(invId){
  const inv = state.invoices.find(i=> i.id===invId);
  if(inv) showInvoice(inv);
}

// ====== UI dialogs & prompts (with time input behavior B) ======
function openStartDialog(roomId, pageType){
  const room = state.rooms.find(r=> r.id===roomId);
  if(!room) return alert('غرفة غير موجودة');
  const modal = document.createElement('div'); modal.className='modal-backdrop';
  // modes options UI depends on type
  let modeButtonsHTML = '';
  if(room.type==='ps5' || room.type==='ps4'){
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','match')">مباراة</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','hour')">ساعة</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','training')">تدريب</button>`;
  } else if(room.type==='billiard'){
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','pool')">Pool</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','snooker')">Snooker</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','hour')">ساعة</button>`;
  } else if(room.type==='tennis'){
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','single')">فردي</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','double')">زوجي</button>`;
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','hour')">ساعة</button>`;
  } else {
    modeButtonsHTML += `<button class="btn btn-primary" onclick="__startWithTime('${roomId}','hour')">ساعة</button>`;
  }

  modal.innerHTML = `
    <div class="invoice-modal" style="max-width:520px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h3>بدء جلسة — ${room.name}</h3><div class="small">اختر الوضع وحدد وقت الدخول (مثل 09:30)</div></div>
        <div><button class="btn btn-ghost" id="closeStart">إلغاء</button></div>
      </div>
      <div style="margin-top:12px" class="form-row">
        <label class="small">وقت الدخول:</label>
        <input id="startTimeInput" class="input" type="time" placeholder="مثال: 09:30">
      </div>
      <div style="margin-top:10px" class="small">إذا تركت خانة الوقت فارغة سيبدأ العد من الآن</div>
      <div style="margin-top:12px" class="controls">${modeButtonsHTML}</div>
      <div style="margin-top:8px" class="controls"><button class="btn btn-ghost" onclick="document.getElementById('startTimeInput').value='09:00'">09:00</button><button class="btn btn-ghost" onclick="document.getElementById('startTimeInput').value='09:30'">09:30</button><button class="btn btn-ghost" onclick="document.getElementById('startTimeInput').value='10:00'">10:00</button></div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('closeStart').onclick = ()=> modal.remove();

  window.__startWithTime = function(roomIdArg, chosenMode){
    const startTime = document.getElementById('startTimeInput').value;
    // If empty -> start from now
    if(!startTime){
      startSession(roomIdArg, 0, 0, chosenMode);
    } else {
      // Use startTime (HH:MM) and apply behavior B
      startSessionWithStartTime(roomIdArg, startTime, chosenMode);
    }
    modal.remove();
  };
}

function openAddProductToRoomPrompt(roomId){
  const modal = document.createElement('div'); modal.className='modal-backdrop';
  const productsHtml = state.products.map(p=>`<option value="${p.id}">${p.name} — ${p.sellPrice} ج — مخزون:${p.stock}</option>`).join('');
  modal.innerHTML = `
    <div class="invoice-modal" style="max-width:520px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h3>أضف منتج — ${roomId}</h3><div class="small">اختر المنتج والكمية</div></div>
        <div><button class="btn btn-ghost" id="closeAddProd">إلغاء</button></div>
      </div>
      <div style="margin-top:10px" class="form-row"><select id="prodSelect" class="input">${productsHtml}</select><input id="prodQty" class="input" type="number" value="1" min="1"></div>
      <div style="margin-top:10px"><button class="btn btn-primary" id="addProdBtn">أضف</button></div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('closeAddProd').onclick = ()=> modal.remove();
  document.getElementById('addProdBtn').onclick = ()=>{
    const pid = document.getElementById('prodSelect').value;
    const qty = Number(document.getElementById('prodQty').value||1);
    let s = state.sessions.find(x=> x.roomId===roomId && !x.stoppedAt && !x.endedAt);
    if(!s){
      if(confirm('لا توجد جلسة شغالة. هل تريد بدء جلسة الآن؟')){
        startSession(roomId,0,0,null);
        s = state.sessions.find(x=> x.roomId===roomId && !x.stoppedAt && !x.endedAt);
        if(!s) return alert('فشل بدء الجلسة');
      } else { modal.remove(); return; }
    }
    addProductToSession(s.id, pid, qty);
    modal.remove();
  };
}

function sellProductStandalonePrompt(pid){
  const qty = Number(prompt('ادخل الكمية', '1') || 1);
  sellProductStandalone(pid, qty);
}

function openCheckout(roomId){
  const s = state.sessions.find(x=> x.roomId===roomId && !x.endedAt);
  if(!s) return alert('لا توجد جلسة لهذه الغرفة');
  if(!confirm('هل تريد إنهاء الجلسة وتحضير الفاتورة؟')) return;
  endSession(s.id);
}

// quick pause/resume
function quickPauseResume(roomId){
  const active = state.sessions.find(s=> s.roomId===roomId && !s.stoppedAt && !s.endedAt);
  if(active){ pauseSession(active.id); return; }
  const paused = state.sessions.find(s=> s.roomId===roomId && s.stoppedAt && !s.endedAt);
  if(paused){ resumeSession(paused.id); return; }
  alert('لا توجد جلسة شغالة أو موقوفة');
}

// admin helpers
function addRoomFromAdmin(){
  const name = document.getElementById('room-name').value || 'Room ' + (state.rooms.length+1);
  const type = document.getElementById('room-type').value;
  const sub = document.getElementById('room-sub').value || '';
  state.rooms.push({ id: `${type}_${Date.now()}`, name, type, sub });
  document.getElementById('room-name').value = '';
  save(state); renderAll(); alert('تم إضافة الغرفة');
}
function deleteRoom(id){ if(!confirm('حذف الغرفة؟')) return; state.rooms = state.rooms.filter(r=> r.id!==id); state.sessions = state.sessions.filter(s=> s.roomId!==id); save(state); renderAll(); }
function savePricesFromForm(){
  state.prices.ps5_hour = Number(document.getElementById('price-ps5').value||state.prices.ps5_hour);
  state.prices.ps4_hour = Number(document.getElementById('price-ps4').value||state.prices.ps4_hour);
  state.prices.ps5_match = Number(document.getElementById('price-ps5m').value||state.prices.ps5_match);
  state.prices.ps4_match = Number(document.getElementById('price-ps4m').value||state.prices.ps4_match);
  state.prices.billiard_pool = Number(document.getElementById('price-b').value||state.prices.billiard_pool);
  state.prices.billiard_snooker = Number(document.getElementById('price-s').value||state.prices.billiard_snooker);
  state.prices.tennis_single = Number(document.getElementById('price-t1').value||state.prices.tennis_single);
  state.prices.tennis_double = Number(document.getElementById('price-t2').value||state.prices.tennis_double);
  save(state); alert('تم حفظ الأسعار'); renderAll();
}

// add product from admin form
function addProductFromAdmin(){
  const name = document.getElementById('prod-name')?.value?.trim();
  const sell = Number(document.getElementById('prod-price')?.value||0);
  const wholesale = Number(document.getElementById('prod-wholesale')?.value||0);
  const stock = Number(document.getElementById('prod-stock')?.value||0);
  if(!name || !sell) return alert('ادخل اسم وسعر البيع');
  addProduct(name, sell, wholesale, stock);
  document.getElementById('prod-name').value=''; document.getElementById('prod-price').value=''; document.getElementById('prod-wholesale').value=''; document.getElementById('prod-stock').value='';
  alert('تم إضافة المنتج');
}

// theme switch
function setTheme(theme){
  state.theme = theme; save(state); applyTheme(); renderAll();
}

// ticker to update timers and rings
let TICK = null;
function startTicker(){
  if(TICK) clearInterval(TICK);
  TICK = setInterval(()=>{
    ['play-rooms','billiard-rooms','tennis-rooms'].forEach(containerId=>{
      const container = document.getElementById(containerId);
      if(!container) return;
      state.rooms.forEach(r=>{
        const timeEl = document.getElementById('time_'+r.id);
        if(timeEl){
          const active = state.sessions.find(s=> s.roomId===r.id && !s.stoppedAt && !s.endedAt);
          const paused = state.sessions.find(s=> s.roomId===r.id && s.stoppedAt && !s.endedAt);
          const elapsed = active? ((now()-active.startedAt) + (active.accMs||0)) : (paused? (paused.accMs||0) : 0);
          timeEl.textContent = active||paused? fmtMs(elapsed) : '00:00:00';
        }
        const ring = document.getElementById('ring_'+r.id);
        if(ring){
          const circ = Number(ring.getAttribute('data-circ')|| (2*Math.PI*46));
          const s = state.sessions.find(x=> x.roomId===r.id && !x.stoppedAt && !x.endedAt);
          if(s && s.presetMinutes){
            const totalSec = s.presetMinutes * 60;
            const elapsedSec = ((now()-s.startedAt) + (s.accMs||0))/1000;
            const ratio = Math.min(1, elapsedSec/totalSec);
            ring.style.strokeDashoffset = ((1-ratio)*circ).toFixed(2);
          } else {
            ring.style.strokeDashoffset = circ;
          }
        }
        const pEl = document.getElementById('price_'+r.id);
        if(pEl){
          const sAct = state.sessions.find(s=> s.roomId===r.id && !s.stoppedAt && !s.endedAt);
          const sPaused = state.sessions.find(s=> s.roomId===r.id && s.stoppedAt && !s.endedAt);
          const elapsed = sAct? ((now()-sAct.startedAt) + (sAct.accMs||0)) : (sPaused? sPaused.accMs||0 : 0);
          const mins = Math.ceil(elapsed/60000);
          pEl.textContent = ((computePricePerHour(r, sAct? sAct.mode : null)/60)*mins).toFixed(2);
        }
      });
    });
  }, 800);
}

// initial render
function renderAll(){
  save(state);
  applyTheme();
  renderPlaystationPage(); renderBilliardPage(); renderTennisPage(); renderProductsPage(); renderAdmin(); renderInvoices();
}
window.addEventListener('load', ()=>{ renderAll(); startTicker(); });
