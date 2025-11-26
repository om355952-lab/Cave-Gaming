/* script.js - كامل ومحدّث
   يدعم: PS5, PS4, Billiard, Snooker, Tennis, Gym
   حفظ في localStorage. العدّاد، المنبّه، الفاتورة.
*/

/* ----- مسار اللوجو (الملف اللي رفعته) ----- */
const LOGO_PATH = '/mnt/data/08130c3a-70a1-4a3f-bd38-5d1c3b224c51.png';

/* ----- مفاتيح التخزين ----- */
const K_ROOMS = 'kahf_rooms';
const K_PRICES = 'kahf_prices';
const K_SESSIONS = 'kahf_sessions';
const K_PRODUCTS = 'kahf_products';
const K_THEME = 'kahf_theme';

/* ----- مساعدة DOM ----- */
function $(s){ return document.querySelector(s); }
function $all(s){ return Array.from(document.querySelectorAll(s)); }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function load(k,def){ try { const v = JSON.parse(localStorage.getItem(k)); return v===null?def:v||def } catch(e) { return def } }

/* ----- اعدادات افتراضية ----- */
function ensureDefaults(){
  if(!load(K_PRICES, null)){
    save(K_PRICES, {
      ps5_per_hour: 40,
      ps4_per_hour: 30,
      billiard_per_hour: 60,
      snooker_per_hour: 70,
      tennis_per_hour: 40,
      gym_per_hour: 35
    });
  }
  if(!load(K_ROOMS, null)){
    const rooms = [];
    // PS5: 3
    for(let i=1;i<=3;i++) rooms.push({id:`ps5_${i}`, name:`Room ${i}`, type:'ps5'});
    // PS4: 4 (Room numbering continues separately per type)
    for(let i=1;i<=4;i++) rooms.push({id:`ps4_${i}`, name:`Room ${i}`, type:'ps4'});
    // Billiard: 3
    for(let i=1;i<=3;i++) rooms.push({id:`billiard_${i}`, name:`Room ${i}`, type:'billiard'});
    // Snooker: 0 by default (we allow admin to change type per table)
    // Tennis: 1
    rooms.push({id:`tennis_1`, name:`Room 1`, type:'tennis'});
    // Gym: 1 (اضفت gym حسب طلبك)
    rooms.push({id:`gym_1`, name:`Room 1`, type:'gym'});
    save(K_ROOMS, rooms);
  }
  if(!load(K_SESSIONS, null)) save(K_SESSIONS, []);
  if(!load(K_PRODUCTS, null)) save(K_PRODUCTS, [
    { id: 'p1', name: 'Pepsi', price: 20, stock: 50 },
    { id: 'p2', name: 'Chips', price: 15, stock: 40 }
  ]);
  const th = localStorage.getItem(K_THEME) || 'theme-default';
  if(th) document.body.classList.add(th);
}
ensureDefaults();

/* ----- جلسات & منطق الوقت ----- */
function getRooms(){ return load(K_ROOMS, []) }
function getPrices(){ return load(K_PRICES, {}) }
function getSessions(){ return load(K_SESSIONS, []) }
function saveSessions(arr){ save(K_SESSIONS, arr) }

/* فورمات الوقت HH:MM:SS */
function fmtMs(ms){
  const s = Math.floor(ms/1000);
  const hh = Math.floor(s/3600), mm = Math.floor((s%3600)/60), ss = s%60;
  const p = n => String(n).padStart(2,'0');
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

/* لعب صوت المنبه */
function playAlarm(){
  const a = document.getElementById('alarmSound');
  if(a) a.play().catch(()=>{});
  else alert('🔔 تنبيه');
}

/* إنشاء جلسة جديدة لغرفة */
function startSession(roomId){
  const sessions = getSessions();
  if(sessions.find(s=> s.roomId===roomId && !s.stoppedAt)) return alert('هناك جلسة شغالة بالفعل لهذه الغرفة');
  const s = { id: 'S'+Date.now(), roomId, startedAt: Date.now(), stoppedAt: null, accMs: 0, alarmMs: null, _fired: false };
  sessions.push(s);
  saveSessions(sessions);
  renderAllPages();
}

/* إيقاف جلسة (finalize) */
function stopSession(sessionId){
  const sessions = getSessions();
  const s = sessions.find(x=> x.id===sessionId);
  if(!s || s.stoppedAt) return;
  s.stoppedAt = Date.now();
  s.accMs = (s.accMs || 0) + (s.stoppedAt - s.startedAt);
  saveSessions(sessions);
  playAlarm();
  showInvoice(s);
  renderAllPages();
}

/* Pause (توقيف مؤقت) */
function pauseSession(sessionId){
  const sessions = getSessions();
  const s = sessions.find(x=> x.id===sessionId);
  if(!s || s.stoppedAt) return;
  s.stoppedAt = Date.now();
  s.accMs = (s.accMs || 0) + (s.stoppedAt - s.startedAt);
  // نترك الجلسة موجودة لكن نعتبرها متوقفه (يمكن إعادة تشغيلها كمواصلة) - هنا سنستخدم حذف startedAt لمعاودة start
  saveSessions(sessions);
  renderAllPages();
}

/* استئناف جلسة (resume) */
function resumeSession(sessionId){
  const sessions = getSessions();
  const s = sessions.find(x=> x.id===sessionId);
  if(!s) return;
  if(!s.stoppedAt){ return; } // مش متوقفة
  // نعيد تعيين startedAt = الآن مع الاحتفاظ بـ accMs
  s.startedAt = Date.now();
  s.stoppedAt = null;
  saveSessions(sessions);
  renderAllPages();
}

/* ضبط منبه زمني (بالدقائق) للجلسة النشطة لغرفة */
function setAlarmForRoom(roomId){
  const sessions = getSessions();
  const active = sessions.find(s => s.roomId===roomId && !s.stoppedAt);
  if(!active) return alert('افتح الجلسة أولاً');
  const mins = prompt('اضبط منبه بعد كم دقيقة؟ (مثال: 30)');
  if(!mins) return;
  const m = parseFloat(mins);
  if(isNaN(m) || m <= 0) return alert('ادخل رقم صحيح');
  active.alarmMs = Math.round(m * 60000);
  active._fired = false;
  saveSessions(sessions);
  alert('تم ضبط المنبه');
}

/* علامة انه تم تشغيل المنبه بالفعل مرة واحدة */
function markAlarmFired(sessionId){
  const arr = getSessions();
  const s = arr.find(x=> x.id===sessionId);
  if(s){ s._fired = true; saveSessions(arr); }
}

/* فاتورة مبسطة */
function showInvoice(session){
  const rooms = getRooms();
  const room = rooms.find(r=> r.id === session.roomId);
  const prices = getPrices();
  let perHour = 0;
  if(room.type === 'ps5') perHour = prices.ps5_per_hour || 0;
  else if(room.type === 'ps4') perHour = prices.ps4_per_hour || 0;
  else if(room.type === 'billiard') perHour = prices.billiard_per_hour || 0;
  else if(room.type === 'snooker') perHour = prices.snooker_per_hour || 0;
  else if(room.type === 'tennis') perHour = prices.tennis_per_hour || 0;
  else if(room.type === 'gym') perHour = prices.gym_per_hour || 0;
  const minutes = Math.ceil((session.accMs || 0) / 60000);
  const total = (perHour / 60) * minutes;
  alert(`فاتورة الجلسة:\nالغرفة: ${room.name}\nالنوع: ${room.type}\nالمدة: ${minutes} دقيقة\nالإجمالي: ${total.toFixed(2)} جنيه`);
}

/* ----- تحديث العرض (Timers + Prices) ----- */
let _tick = null;
function startTicker(){
  if(_tick) clearInterval(_tick);
  _tick = setInterval(()=>{
    // تحقق من منبهات
    const sessions = getSessions();
    sessions.forEach(s=>{
      if(!s.stoppedAt && s.alarmMs && !s._fired){
        const elapsed = Date.now() - s.startedAt + (s.accMs || 0);
        if(elapsed >= s.alarmMs){
          playAlarm();
          s._fired = true;
          saveSessions(sessions);
          alert('انتهى وقت المنبه للغرفة');
        }
      }
    });
    // حدّث عناصر الوقت والسعر على كل الصفحات
    updateTimersOnPage();
  }, 800);
}
function updateTimersOnPage(){
  getRooms().forEach(r=>{
    const tEl = document.getElementById('timer_'+r.id);
    const pEl = document.getElementById('price_'+r.id);
    const sessions = getSessions();
    const active = sessions.find(x=> x.roomId===r.id && !x.stoppedAt);
    if(tEl){
      tEl.textContent = active ? fmtMs((Date.now() - active.startedAt) + (active.accMs || 0)) : '00:00:00';
    }
    if(pEl){
      if(active){
        const prices = getPrices();
        let perHour = 0;
        if(r.type === 'ps5') perHour = prices.ps5_per_hour || 0;
        else if(r.type === 'ps4') perHour = prices.ps4_per_hour || 0;
        else if(r.type === 'billiard') perHour = prices.billiard_per_hour || 0;
        else if(r.type === 'snooker') perHour = prices.snooker_per_hour || 0;
        else if(r.type === 'tennis') perHour = prices.tennis_per_hour || 0;
        else if(r.type === 'gym') perHour = prices.gym_per_hour || 0;
        const mins = Math.ceil(((Date.now() - active.startedAt) + (active.accMs || 0))/60000);
        pEl.textContent = ((perHour/60)*mins).toFixed(2);
      } else pEl.textContent = '0.00';
    }
  });
}

/* ----- رندر صفحات منفصلة ----- */

/* PlayStation */
function renderPlaystation(){
  const el = $('#play-rooms');
  if(!el) return;
  el.innerHTML = '';
  const rooms = getRooms().filter(r=> r.type==='ps5' || r.type==='ps4');
  rooms.forEach(r=>{
    const s = getSessions().find(x=> x.roomId===r.id && !x.stoppedAt);
    const div = document.createElement('div'); div.className='card room';
    div.innerHTML = `
      <h3>${r.type.toUpperCase()} — ${r.name}</h3>
      <div class="timer-widget" style="display:flex;gap:14px;align-items:center">
        <div class="timer-circle">
          <svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"></circle><circle class="progress" cx="60" cy="60" r="52" stroke="#9b00ff" style="stroke-dasharray:${2*Math.PI*52};stroke-dashoffset:${2*Math.PI*52}"></circle></svg>
          <div class="timer-center"><div id="timer_${r.id}" class="digital">${s? fmtMs((Date.now()-s.startedAt)+(s.accMs||0)) : '00:00:00'}</div><div class="small">الوقت</div></div>
        </div>
        <div style="flex:1">
          <div style="margin-bottom:8px">السعر الآن: <span id="price_${r.id}" class="price">0.00</span> ج</div>
          <div class="controls">
            <button class="btn btn-primary" onclick="startSession('${r.id}')">ابدأ</button>
            <button class="btn btn-ghost" onclick="pauseOrStopRoom('${r.id}')">إيقاف مؤقت</button>
            <button class="btn btn-accent" onclick="setAlarmForRoom('${r.id}')">🔔 ضبط منبه</button>
          </div>
        </div>
      </div>
    `;
    el.appendChild(div);
  });
}

/* Billiard & Snooker - render as requested (type selectable per room) */
function renderBilliardSnooker(){
  const el = $('#billiard-rooms');
  if(!el) return;
  el.innerHTML = '';
  const rooms = getRooms().filter(r=> r.type === 'billiard' || r.type === 'snooker');
  rooms.forEach(r=>{
    const s = getSessions().find(x=> x.roomId===r.id && !x.stoppedAt);
    const div = document.createElement('div'); div.className='card room';
    div.innerHTML = `
      <h3>${(r.type==='billiard'?'Billiard':'Snooker')} — ${r.name}</h3>
      <div id="timer_${r.id}" class="timer">${s? fmtMs((Date.now()-s.startedAt)+(s.accMs||0)) : '00:00:00'}</div>
      <div style="margin-top:8px">السعر الآن: <span id="price_${r.id}" class="price">0.00</span> ج</div>
      <div class="controls" style="margin-top:8px">
        <button class="btn btn-primary" onclick="startSession('${r.id}')">ابدأ</button>
        <button class="btn btn-ghost" onclick="pauseOrStopRoom('${r.id}')">إيقاف مؤقت</button>
        <button class="btn btn-accent" onclick="setAlarmForRoom('${r.id}')">🔔 ضبط منبه</button>
      </div>
    `;
    el.appendChild(div);
  });
}

/* Tennis page */
function renderTennis(){
  const el = $('#tennis-rooms'); if(!el) return;
  el.innerHTML = '';
  const rooms = getRooms().filter(r=> r.type === 'tennis');
  rooms.forEach(r=>{
    const s = getSessions().find(x=> x.roomId===r.id && !x.stoppedAt);
    const div = document.createElement('div'); div.className='card room';
    div.innerHTML = `
      <h3>Tennis — ${r.name}</h3>
      <div id="timer_${r.id}" class="timer">${s? fmtMs((Date.now()-s.startedAt)+(s.accMs||0)) : '00:00:00'}</div>
      <div style="margin-top:8px">السعر الآن: <span id="price_${r.id}" class="price">0.00</span> ج</div>
      <div class="controls" style="margin-top:8px">
        <button class="btn btn-primary" onclick="startSession('${r.id}')">ابدأ</button>
        <button class="btn btn-ghost" onclick="pauseOrStopRoom('${r.id}')">إيقاف مؤقت</button>
        <button class="btn btn-accent" onclick="setAlarmForRoom('${r.id}')">🔔 ضبط منبه</button>
      </div>
    `;
    el.appendChild(div);
  });
}

/* Gym page */
function renderGym(){
  const el = $('#gym-rooms'); if(!el) return;
  el.innerHTML = '';
  const rooms = getRooms().filter(r=> r.type === 'gym');
  rooms.forEach(r=>{
    const s = getSessions().find(x=> x.roomId===r.id && !x.stoppedAt);
    const div = document.createElement('div'); div.className='card room';
    div.innerHTML = `
      <h3>Gym — ${r.name}</h3>
      <div id="timer_${r.id}" class="timer">${s? fmtMs((Date.now()-s.startedAt)+(s.accMs||0)) : '00:00:00'}</div>
      <div style="margin-top:8px">السعر الآن: <span id="price_${r.id}" class="price">0.00</span> ج</div>
      <div class="controls" style="margin-top:8px">
        <button class="btn btn-primary" onclick="startSession('${r.id}')">ابدأ</button>
        <button class="btn btn-ghost" onclick="pauseOrStopRoom('${r.id}')">إيقاف مؤقت</button>
        <button class="btn btn-accent" onclick="setAlarmForRoom('${r.id}')">🔔 ضبط منبه</button>
      </div>
    `;
    el.appendChild(div);
  });
}

/* Sell products (simple) */
function renderProducts(){
  const el = $('#products-list'); if(!el) return;
  el.innerHTML = '';
  const products = load(K_PRODUCTS, []);
  if(products.length === 0){ el.innerHTML = `<div class="card">لا توجد منتجات</div>`; return; }
  products.forEach(p=>{
    const d = document.createElement('div'); d.className='card';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${p.name}</strong><div class="small">سعر: ${p.price} ج — الكمية: ${p.stock}</div></div><div><button class="btn btn-primary" onclick="sellProduct('${p.id}')">بيع</button></div></div>`;
    el.appendChild(d);
  });
}
function sellProduct(productId){
  const arr = load(K_PRODUCTS, []);
  const p = arr.find(x=> x.id===productId);
  if(!p) return;
  if(p.stock <= 0) return alert('نفذ المنتج');
  p.stock -= 1;
  save(K_PRODUCTS, arr);
  renderProducts();
  alert('تم البيع: ' + p.name);
}

/* Pause or stop helper (pause behaviour here we finalize partial time but keep session record) */
function pauseOrStopRoom(roomId){
  const sessions = getSessions();
  const s = sessions.find(x=> x.roomId===roomId && !x.stoppedAt);
  if(!s) return alert('لا توجد جلسة شغالة');
  // هنا نعتبرها إيقاف مؤقت (نخزن accMs)
  s.stoppedAt = Date.now();
  s.accMs = (s.accMs || 0) + (s.stoppedAt - s.startedAt);
  saveSessions(sessions);
  playAlarm();
  renderAllPages();
}

/* ----- Admin: add/delete rooms, prices, products ----- */
function renderAdmin(){
  const prices = getPrices();
  if($('#price-ps5')) $('#price-ps5').value = prices.ps5_per_hour || '';
  if($('#price-ps4')) $('#price-ps4').value = prices.ps4_per_hour || '';
  if($('#price-b')) $('#price-b').value = prices.billiard_per_hour || '';
  if($('#price-s')) $('#price-s').value = prices.snooker_per_hour || '';
  if($('#price-t')) $('#price-t').value = prices.tennis_per_hour || '';
  if($('#price-g')) $('#price-g').value = prices.gym_per_hour || '';

  // rooms list
  const rooms = getRooms();
  const el = $('#admin-rooms'); if(el){
    el.innerHTML = '';
    rooms.forEach(r=>{
      const d = document.createElement('div'); d.className='card'; d.style.marginBottom='8px';
      d.innerHTML = `<strong>${r.type.toUpperCase()} — ${r.name}</strong> <div style="margin-top:6px"><button class="btn btn-ghost" onclick="deleteRoom('${r.id}')">حذف</button></div>`;
      el.appendChild(d);
    });
  }
  // products list
  const prodEl = $('#admin-products'); if(prodEl){
    prodEl.innerHTML = '';
    load(K_PRODUCTS, []).forEach(p=>{
      const d = document.createElement('div'); d.className='card'; d.innerHTML = `${p.name} — ${p.price}ج — ${p.stock} <button class="btn btn-ghost" onclick="deleteProduct('${p.id}')">حذف</button>`; prodEl.appendChild(d);
    });
  }
}
function addRoom(){
  const name = $('#room-name').value || (`Room ${Date.now()}`);
  const type = $('#room-type').value;
  const rooms = getRooms();
  const id = `${type}_${Date.now()}`;
  rooms.push({id,name,type});
  save(K_ROOMS, rooms);
  $('#room-name').value='';
  renderAdmin(); renderAllPages();
  alert('تم إضافة الغرفة');
}
function deleteRoom(id){
  if(!confirm('حذف الغرفة؟')) return;
  const arr = getRooms().filter(r=> r.id!==id);
  save(K_ROOMS, arr);
  renderAdmin(); renderAllPages();
}
function savePrices(){
  const ps5 = parseFloat($('#price-ps5').value||0);
  const ps4 = parseFloat($('#price-ps4').value||0);
  const b = parseFloat($('#price-b').value||0);
  const s = parseFloat($('#price-s').value||0);
  const t = parseFloat($('#price-t').value||0);
  const g = parseFloat($('#price-g').value||0);
  save(K_PRICES, {ps5_per_hour:ps5, ps4_per_hour:ps4, billiard_per_hour:b, snooker_per_hour:s, tennis_per_hour:t, gym_per_hour:g});
  alert('تم حفظ الأسعار');
  renderAllPages();
}

/* products admin */
function addProduct(){
  const name = $('#prod-name').value || 'منتج';
  const price = parseFloat($('#prod-price').value||0);
  const stock = parseInt($('#prod-stock').value||0);
  const arr = load(K_PRODUCTS, []);
  arr.push({id:'p'+Date.now(), name, price, stock});
  save(K_PRODUCTS, arr);
  $('#prod-name').value=''; $('#prod-price').value=''; $('#prod-stock').value='';
  renderAdmin(); renderProducts();
  alert('تم إضافة المنتج');
}
function deleteProduct(id){
  if(!confirm('حذف المنتج؟')) return;
  const arr = load(K_PRODUCTS, []).filter(x=> x.id!==id);
  save(K_PRODUCTS, arr);
  renderAdmin(); renderProducts();
}

/* ----- render all pages helper ----- */
function renderAllPages(){
  renderPlaystation();
  renderBilliardSnooker();
  renderTennis();
  renderGym();
  renderProducts();
  renderAdmin();
}

/* ----- init ----- */
window.addEventListener('load', ()=>{
  // إذا تضع صوت منبه، تأكد أن هناك عنصر audio#alarmSound في HTML
  renderAllPages();
  startTicker();
});

/* --- انتهى ملف script.js --- */
