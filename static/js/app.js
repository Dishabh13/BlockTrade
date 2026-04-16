// ─── Navigation ───
document.querySelectorAll('.sb-nav a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.sb-nav a').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    document.getElementById('page-'+a.dataset.page).classList.add('active');
    refreshPage(a.dataset.page);
  });
});

function refreshPage(page){
  if(page==='dashboard')   loadDashboard();
  if(page==='trader')      loadTraderOrders();
  if(page==='matching')    loadMatching();
  if(page==='trader-auth') loadTraderAuth();
  if(page==='asset-auth')  loadAssetAuth();
  if(page==='coordinator') loadCoordinator();
  if(page==='ledger')      loadLedger();
}

// ─── Toast ───
function toast(msg, type='info'){
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type==='success'?'✓':type==='error'?'✗':'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(()=>{ t.style.animation='slide-out .25s ease forwards'; setTimeout(()=>t.remove(),250); }, 3000);
}

// ─── API Helper ───
async function api(path, method='GET', body=null){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}
async function addTrader(){
  const name = document.getElementById('new-name').value;
  const balance = parseFloat(document.getElementById('new-balance').value);

  const r = await api('/api/add_trader','POST',{name, balance});

  if(r.success){
    toast('Trader added: '+r.trader_id,'success');
    refreshAllDropdowns();
  }
}

async function addAsset(){
  const stock = document.getElementById('new-stock').value;

  const r = await api('/api/add_asset','POST',{stock});

  if(r.success){
    toast('Asset added: '+r.stock,'success');
    refreshAllDropdowns();
  }
}

async function refreshAllDropdowns(){
  const d = await api('/api/state');

  const traderSelect = document.getElementById('o-trader');
  traderSelect.innerHTML = '';

  for(const [id,t] of Object.entries(d.traders)){
    traderSelect.innerHTML += `<option value="${id}">${id} — ${t.name}</option>`;
  }

  const stockSelect = document.getElementById('o-stock');
  stockSelect.innerHTML = '';

  const stocks = new Set();
  Object.values(d.assets).forEach(a=>{
    Object.keys(a).forEach(s=>stocks.add(s));
  });

  stocks.forEach(s=>{
    stockSelect.innerHTML += `<option>${s}</option>`;
  });
}
// ─── DASHBOARD ───
async function loadDashboard(){
  const d = await api('/api/state');
  document.getElementById('stat-orders').textContent = d.total_orders;
  document.getElementById('stat-trades').textContent = d.committed + d.aborted;
  document.getElementById('stat-blocks').textContent = d.blocks;
  const total = d.committed + d.aborted;
  document.getElementById('stat-rate').textContent = total ? Math.round(d.committed/total*100)+'%' : '—';

  // Trader table
  const tb = document.querySelector('#tbl-traders tbody');
  tb.innerHTML = '';
  for(const [id,t] of Object.entries(d.traders)){
    const h = Object.entries(d.assets[id]||{}).map(([s,q])=>q>0?`${s}:${q}`:'').filter(Boolean).join(', ')||'—';
    tb.innerHTML += `<tr><td><strong>${id}</strong> (${t.name})</td><td style="font-family:var(--mono)">₹${t.balance.toFixed(2)}</td><td style="font-size:11px;color:var(--muted)">${h}</td></tr>`;
  }
  renderLogs(d.logs, 'log-dash');
}

function renderLogs(ls, elId){
  const el = document.getElementById(elId);
  el.innerHTML = (ls.slice(-30).reverse().map(l=>`
    <div class="log-line log-${l.level}">
      <span class="log-time">${l.time}</span>
      <span class="log-source">[${l.source}]</span>
      <span class="log-msg">${l.message}</span>
    </div>`).join(''));
}

// ─── PLACE ORDER ───
async function placeOrder(){
  const body = {
    trader_id: document.getElementById('o-trader').value,
    order_type: document.getElementById('o-type').value,
    stock: document.getElementById('o-stock').value,
    quantity: parseInt(document.getElementById('o-qty').value),
    price: parseFloat(document.getElementById('o-price').value)
  };
  const r = await api('/api/place_order','POST',body);
  if(r.success){ toast('Order placed: '+r.order_id,'success'); loadTraderOrders(); }
  else toast(r.error,'error');
}

async function loadTraderOrders(){
  const d = await api('/api/state');
  const orders = [...d.buy_orders, ...d.sell_orders];
  const tb = document.querySelector('#tbl-myorders tbody');
  tb.innerHTML = orders.length ? orders.map(o=>`
    <tr><td style="font-family:var(--mono);font-size:11px">${o.id.slice(-6)}</td>
    <td><span class="badge badge-${o.type.toLowerCase()}">${o.type}</span></td>
    <td>${o.stock}</td><td>${o.quantity}</td>
    <td style="font-family:var(--mono)">₹${o.price}</td>
    <td><span class="badge badge-info">${o.status}</span></td></tr>`).join('') :
    '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No open orders</td></tr>';
}

// ─── MATCHING ───
async function matchOrders(){
  const r = await api('/api/match_orders','POST');
  if(r.success) toast('Match found: '+r.trade_id,'success');
  else toast(r.message,'info');
  loadMatching();
}

async function loadMatching(){
  const d = await api('/api/state');
  const fillTable = (id, rows) => {
    const tb = document.querySelector(`#${id} tbody`);
    tb.innerHTML = rows.length ? rows.map(o=>`<tr><td>${o.trader_id}</td><td>${o.stock}</td><td>${o.quantity}</td><td style="font-family:var(--mono)">₹${o.price}</td></tr>`).join('') :
      '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Empty</td></tr>';
  };
  fillTable('tbl-buy', d.buy_orders);
  fillTable('tbl-sell', d.sell_orders);
  const tb = document.querySelector('#tbl-pending tbody');
  tb.innerHTML = d.pending_trades.length ? d.pending_trades.map(t=>`
    <tr><td style="font-family:var(--mono);font-size:11px">${t.id.slice(-8)}</td>
    <td>${t.buyer_id}</td><td>${t.seller_id}</td>
    <td>${t.stock}</td><td>${t.quantity}</td>
    <td style="font-family:var(--mono)">₹${t.price}</td>
    <td><span class="badge badge-pending">${t.status}</span></td></tr>`).join('') :
    '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No pending trades</td></tr>';
}

// ─── TRADER AUTH ───
async function validateTrader(tradeId){
  const r = await api('/api/validate_trader','POST',{trade_id:tradeId});
  toast(r.success ? 'Funds validated ✓' : 'Validation failed ✗', r.success?'success':'error');
  loadTraderAuth();
}

async function loadTraderAuth(){
  const d = await api('/api/state');
  const tb = document.querySelector('#tbl-ta-pending tbody');
  const pending = d.pending_trades.filter(t=>t.status==='pending'||t.trader_validated===false);
  tb.innerHTML = pending.length ? pending.map(t=>{
    const cost = (t.quantity*t.price).toFixed(2);
    return `<tr><td style="font-family:var(--mono);font-size:11px">${t.id.slice(-8)}</td>
    <td>${t.buyer_id}</td><td>${t.stock}</td>
    <td style="font-family:var(--mono)">₹${cost}</td>
    <td><button class="btn btn-outline" style="padding:5px 10px;font-size:11px" onclick="validateTrader('${t.id}')">Validate</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No pending validations</td></tr>';

  const tb2 = document.querySelector('#tbl-ta-balances tbody');
  tb2.innerHTML = Object.entries(d.traders).map(([id,t])=>`<tr><td>${id} (${t.name})</td><td style="font-family:var(--mono)">₹${t.balance.toFixed(2)}</td></tr>`).join('');
  renderLogs(d.logs.filter(l=>l.source.includes('Trader Authority')||l.source.includes('trader')), 'log-ta');
  loadAuthorityChains();
}

// ─── ASSET AUTH ───
async function validateAsset(tradeId){
  const r = await api('/api/validate_asset','POST',{trade_id:tradeId});
  toast(r.success ? 'Shares validated ✓' : 'Validation failed ✗', r.success?'success':'error');
  loadAssetAuth();
}

async function loadAssetAuth(){
  const d = await api('/api/state');
  const tb = document.querySelector('#tbl-aa-pending tbody');
  const pending = d.pending_trades.filter(t=>t.status==='pending'||t.asset_validated===false);
  tb.innerHTML = pending.length ? pending.map(t=>`
    <tr><td style="font-family:var(--mono);font-size:11px">${t.id.slice(-8)}</td>
    <td>${t.seller_id}</td><td>${t.stock}</td><td>${t.quantity}</td>
    <td><button class="btn btn-outline" style="padding:5px 10px;font-size:11px" onclick="validateAsset('${t.id}')">Validate</button></td></tr>`).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No pending validations</td></tr>';

  const tb2 = document.querySelector('#tbl-aa-assets tbody');
  tb2.innerHTML = Object.entries(d.assets).map(([id,a])=>
    `<tr><td>${id}</td><td>${a.AAPL||0}</td><td>${a.TSLA||0}</td><td>${a.GOOG||0}</td></tr>`).join('');
  renderLogs(d.logs.filter(l=>l.source.includes('Asset Authority')||l.source.includes('asset')), 'log-aa');
  loadAuthorityChains();
}

// ─── COORDINATOR ───
async function coordinateTrade(){
  const r = await api('/api/coordinate_trade','POST');
  if(r.decision) toast('Decision: '+r.decision, r.decision==='COMMIT'?'success':'error');
  else toast(r.message||'No trade to coordinate','info');
  loadCoordinator();
}

async function loadCoordinator(){
  const d = await api('/api/state');
  const allTrades = [...d.committed_trades, ...d.aborted_trades];
  const recent = allTrades[allTrades.length-1];

  const box = document.getElementById('coord-display');
  if(recent){
    const tc = recent.trader_validated, ac = recent.asset_validated;
    const dec = recent.status==='committed'?'COMMIT':'ABORT';
    box.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Latest Coordination — Trade ${recent.id.slice(-8)}</div>
        <div class="coord-grid">
          <div class="coord-check ${tc?'success':'fail'}">
            <div class="ci">${tc?'✅':'❌'}</div>
            <div class="ct">Trader Authority</div>
            <div class="cv">${tc?'SUCCESS':'FAIL'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${tc?'Funds locked':'Insufficient balance'}</div>
          </div>
          <div class="coord-check ${ac?'success':'fail'}">
            <div class="ci">${ac?'✅':'❌'}</div>
            <div class="ct">Asset Authority</div>
            <div class="cv">${ac?'SUCCESS':'FAIL'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${ac?'Shares locked':'Insufficient shares'}</div>
          </div>
        </div>
        <div class="decision-box ${dec.toLowerCase()}" style="margin-top:16px">
          <div class="di">${dec==='COMMIT'?'✅':'❌'}</div>
          <div class="dt">${dec}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">${dec==='COMMIT'?'Trade will be settled on-chain':'Trade discarded — no state changes'}</div>
        </div>
      </div>`;
  } else {
    box.innerHTML = `<div class="card" style="margin-bottom:16px;text-align:center;color:var(--muted);padding:40px">No coordination results yet. Place orders and run matching first.</div>`;
  }

  const tb = document.querySelector('#tbl-coord-hist tbody');
  tb.innerHTML = allTrades.length ? allTrades.slice().reverse().map(t=>`
    <tr>
      <td style="font-family:var(--mono);font-size:11px">${t.id.slice(-8)}</td>
      <td><span class="badge ${t.trader_validated?'badge-commit':'badge-abort'}">${t.trader_validated?'SUCCESS':'FAIL'}</span></td>
      <td><span class="badge ${t.asset_validated?'badge-commit':'badge-abort'}">${t.asset_validated?'SUCCESS':'FAIL'}</span></td>
      <td><span class="badge ${t.status==='committed'?'badge-commit':'badge-abort'}">${t.status.toUpperCase()}</span></td>
    </tr>`).join('') :
    '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No coordinations yet</td></tr>';
}

// ─── BLOCKCHAIN LEDGER ───
async function loadLedger(){
  const d = await api('/api/blockchain');
  document.getElementById('chain-valid-badge').className = 'badge ' + (d.valid?'badge-commit':'badge-abort');
  document.getElementById('chain-valid-badge').textContent = d.valid ? '✓ Chain Valid' : '✗ Chain Invalid';
  document.getElementById('chain-length').textContent = d.blocks.length + ' blocks';

  const container = document.getElementById('blockchain-view');
  container.innerHTML = '';
  d.blocks.slice().reverse().forEach((b,i,arr)=>{
    const isGenesis = b.index===0;
    const td = b.trade_data;
    container.innerHTML += `
      ${i>0?'<div class="chain-arrow">↓</div>':''}
      <div class="block-item">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-num">#${b.index}</span>
          <span class="block-type">${isGenesis?'Genesis Block':`${td.stock||''} — ${td.buyer_id||''} ← ${td.seller_id||''}`}</span>
          <span class="block-hash">${b.hash.slice(0,16)}…</span>
          <span class="block-chevron">▶</span>
        </div>
        <div class="block-body">
          <div class="block-field"><span class="key">Index</span><span class="val">${b.index}</span></div>
          <div class="block-field"><span class="key">Timestamp</span><span class="val">${b.timestamp}</span></div>
          ${isGenesis ? `<div class="block-field"><span class="key">Message</span><span class="val">${td.message}</span></div>` :
            `<div class="block-field"><span class="key">Stock</span><span class="val">${td.stock}</span></div>
             <div class="block-field"><span class="key">Buyer</span><span class="val">${td.buyer_id}</span></div>
             <div class="block-field"><span class="key">Seller</span><span class="val">${td.seller_id}</span></div>
             <div class="block-field"><span class="key">Quantity</span><span class="val">${td.quantity}</span></div>
             <div class="block-field"><span class="key">Price</span><span class="val">₹${td.price}</span></div>`}
          <div class="block-field"><span class="key">Previous Hash</span><span class="val">${b.previous_hash.slice(0,32)}…</span></div>
          <div class="block-field"><span class="key">Hash</span><span class="val" style="color:var(--accent)">${b.hash}</span></div>
        </div>
      </div>`;
  });
}

function toggleBlock(header){
  header.classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}

// ─── AUTO REFRESH ───
loadDashboard();
refreshAllDropdowns();
setInterval(()=>{
  const active = document.querySelector('.sb-nav a.active');
  if(active) refreshPage(active.dataset.page);
}, 5000);

// ─── AUTHORITY CHAIN RENDERER ───
async function loadAuthorityChains() {
  const d = await api('/api/authority_chains');

  // ── Trader Authority chain ──
  const taValid = d.trader_authority.valid;
  document.getElementById('ta-chain-valid-badge').className = 'badge ' + (taValid ? 'badge-commit' : 'badge-abort');
  document.getElementById('ta-chain-valid-badge').textContent = taValid ? '✓ Chain Valid' : '✗ Chain Invalid';
  document.getElementById('ta-chain-length').textContent = d.trader_authority.length + ' blocks';

  const taContainer = document.getElementById('ta-blockchain-view');
  taContainer.innerHTML = '';
  d.trader_authority.blocks.slice().reverse().forEach((b, i) => {
    const isGenesis = b.index === 0;
    const td = b.trade_data;
    taContainer.innerHTML += `
      ${i > 0 ? '<div class="chain-arrow">↓</div>' : ''}
      <div class="block-item">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-num">#${b.index}</span>
          <span class="block-type">${isGenesis ? 'Genesis Block' : `${td.buyer_id} — ₹${td.cost} — ${td.result}`}</span>
          <span class="block-hash">${b.hash.slice(0, 16)}…</span>
          <span class="block-chevron">▶</span>
        </div>
        <div class="block-body">
          <div class="block-field"><span class="key">Index</span><span class="val">${b.index}</span></div>
          <div class="block-field"><span class="key">Timestamp</span><span class="val">${b.timestamp}</span></div>
          ${isGenesis
            ? `<div class="block-field"><span class="key">Message</span><span class="val">${td.message}</span></div>`
            : `<div class="block-field"><span class="key">Trade ID</span><span class="val">${td.trade_id.slice(-8)}</span></div>
               <div class="block-field"><span class="key">Buyer</span><span class="val">${td.buyer_id}</span></div>
               <div class="block-field"><span class="key">Cost Locked</span><span class="val">₹${td.cost}</span></div>
               <div class="block-field"><span class="key">Result</span><span class="val" style="color:var(--green)">${td.result}</span></div>
               <div class="block-field"><span class="key">Main Chain Block</span><span class="val">#${td.main_block}</span></div>`}
          <div class="block-field"><span class="key">Prev Hash</span><span class="val">${b.previous_hash.slice(0, 32)}…</span></div>
          <div class="block-field"><span class="key">Hash</span><span class="val" style="color:var(--accent)">${b.hash}</span></div>
        </div>
      </div>`;
  });

  // ── Asset Authority chain ──
  const aaValid = d.asset_authority.valid;
  document.getElementById('aa-chain-valid-badge').className = 'badge ' + (aaValid ? 'badge-commit' : 'badge-abort');
  document.getElementById('aa-chain-valid-badge').textContent = aaValid ? '✓ Chain Valid' : '✗ Chain Invalid';
  document.getElementById('aa-chain-length').textContent = d.asset_authority.length + ' blocks';

  const aaContainer = document.getElementById('aa-blockchain-view');
  aaContainer.innerHTML = '';
  d.asset_authority.blocks.slice().reverse().forEach((b, i) => {
    const isGenesis = b.index === 0;
    const td = b.trade_data;
    aaContainer.innerHTML += `
      ${i > 0 ? '<div class="chain-arrow">↓</div>' : ''}
      <div class="block-item">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-num">#${b.index}</span>
          <span class="block-type">${isGenesis ? 'Genesis Block' : `${td.seller_id} — ${td.stock} x${td.quantity} — ${td.result}`}</span>
          <span class="block-hash">${b.hash.slice(0, 16)}…</span>
          <span class="block-chevron">▶</span>
        </div>
        <div class="block-body">
          <div class="block-field"><span class="key">Index</span><span class="val">${b.index}</span></div>
          <div class="block-field"><span class="key">Timestamp</span><span class="val">${b.timestamp}</span></div>
          ${isGenesis
            ? `<div class="block-field"><span class="key">Message</span><span class="val">${td.message}</span></div>`
            : `<div class="block-field"><span class="key">Trade ID</span><span class="val">${td.trade_id.slice(-8)}</span></div>
               <div class="block-field"><span class="key">Seller</span><span class="val">${td.seller_id}</span></div>
               <div class="block-field"><span class="key">Stock</span><span class="val">${td.stock}</span></div>
               <div class="block-field"><span class="key">Qty Locked</span><span class="val">${td.quantity} shares</span></div>
               <div class="block-field"><span class="key">Result</span><span class="val" style="color:var(--green)">${td.result}</span></div>
               <div class="block-field"><span class="key">Main Chain Block</span><span class="val">#${td.main_block}</span></div>`}
          <div class="block-field"><span class="key">Prev Hash</span><span class="val">${b.previous_hash.slice(0, 32)}…</span></div>
          <div class="block-field"><span class="key">Hash</span><span class="val" style="color:var(--accent)">${b.hash}</span></div>
        </div>
      </div>`;
  });
}
