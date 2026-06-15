/**
 * Branded HTML za company-details-api admin grid (/admin).
 *
 * DOMOVINA brand:
 *   navy #002F6C · red #FF0000 · white #FFFFFF · muted #5A6570
 *
 * Shell (logo, tricolor, stat-tiles, tablica) preuzet iz pipeline.domovina.ai /
 * pay.domovina.ai da admin prepozna isti izgled kroz sve DOMOVINA servise.
 * Grid se renderira shell-om server-side; redovi se pune JSON-om s
 * /admin/api/companies (filter + pretraga + auto-refresh) bez reloada.
 */

const HEADER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="36" height="36" aria-hidden="true">
<defs>
<linearGradient id="hdrFlag" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#FF0000"/><stop offset="33.3%" stop-color="#FF0000"/>
<stop offset="33.3%" stop-color="#FFFFFF"/><stop offset="66.6%" stop-color="#FFFFFF"/>
<stop offset="66.6%" stop-color="#002F6C"/><stop offset="100%" stop-color="#002F6C"/>
</linearGradient>
</defs>
<rect width="512" height="512" rx="32" fill="white"/>
<path d="M72 64H248C354.071 64 440 149.929 440 256C440 362.071 354.071 448 248 448H72V64Z" fill="url(#hdrFlag)"/>
<path d="M168 160H248C301.019 160 344 202.981 344 256C344 309.019 301.019 352 248 352H168V160Z" fill="white"/>
<g stroke="#002F6C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<line x1="205" y1="205" x2="295" y2="225"/><line x1="295" y1="225" x2="285" y2="285"/>
<line x1="285" y1="285" x2="205" y2="307"/><line x1="205" y1="307" x2="205" y2="205"/>
<line x1="205" y1="205" x2="245" y2="256"/><line x1="295" y1="225" x2="245" y2="256"/>
<line x1="285" y1="285" x2="245" y2="256"/><line x1="205" y1="307" x2="245" y2="256"/>
</g>
<g fill="#002F6C">
<circle cx="205" cy="205" r="10"/><circle cx="295" cy="225" r="10"/>
<circle cx="205" cy="307" r="10"/><circle cx="285" cy="285" r="10"/>
<circle cx="245" cy="256" r="14"/>
</g>
</svg>`;

const BASE_STYLE = `<style>
:root {
  --navy:#002F6C; --red:#FF0000; --muted:#5A6570;
  --border:#E1E5EA; --surface:#F5F7F9; --bg:#FFFFFF;
  font-family: system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:var(--bg);color:var(--navy);}
a{color:var(--navy);}
.tricolor{display:flex;height:6px;}
.tricolor span{flex:1;}
.tricolor .red{background:var(--red);} .tricolor .navy{background:var(--navy);}
header{padding:.9rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:1rem;}
header .brand{display:flex;align-items:center;gap:.6rem;}
header .brand .word{font-weight:800;letter-spacing:.04em;font-size:1.1rem;}
header .brand .accent{color:var(--red);}
header .badge{background:var(--surface);border:1px solid var(--border);padding:.25rem .6rem;border-radius:1rem;font-size:.8rem;color:var(--muted);font-weight:600;}
main{padding:1.5rem;max-width:96rem;margin:0 auto;}
h1{font-size:1.45rem;margin:0 0 .35rem;}
.lede{color:var(--muted);margin:0 0 1.25rem;font-size:.9rem;}
.stats{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1.1rem;}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:.5rem;padding:.5rem .85rem;min-width:6rem;cursor:pointer;user-select:none;}
.stat.active{outline:2px solid var(--navy);outline-offset:1px;}
.stat .label{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;}
.stat .value{font-size:1.3rem;font-weight:700;}
.stat.s-mikro{background:#E7EEF8;border-color:#CDDDF6;} .stat.s-mikro .value{color:#1D4ED8;}
.stat.s-mali{background:#E0F1E5;border-color:#BFE3CC;} .stat.s-mali .value{color:#2E8540;}
.stat.s-srednji{background:#FDF1E0;border-color:#F5DEB8;} .stat.s-srednji .value{color:#B45309;}
.stat.s-veliki{background:#F3E8FF;border-color:#E3D4FB;} .stat.s-veliki .value{color:#7C3AED;}
.stat.s-udruga{background:#ECEFF2;border-color:#D4D9DE;} .stat.s-udruga .value{color:#5A6570;}
.stat.s-pending{background:#F8F3E0;border-color:#EFE3B8;} .stat.s-pending .value{color:#92760a;}
.stat.s-failed{background:#F8E2E0;border-color:#F3C9C5;} .stat.s-failed .value{color:#B42318;}
.toolbar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;}
.toolbar input[type=search]{border:1px solid var(--border);border-radius:.4rem;padding:.45rem .7rem;font-size:.9rem;min-width:16rem;font-family:inherit;}
.toolbar select{border:1px solid var(--border);border-radius:.4rem;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;background:var(--bg);color:var(--navy);}
.toolbar .spacer{flex:1;}
.toolbar button{border:1px solid var(--border);background:var(--bg);border-radius:.4rem;padding:.45rem .8rem;font-size:.85rem;font-weight:600;cursor:pointer;}
.toolbar button:hover{background:var(--surface);}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:.5rem;background:var(--bg);}
table{width:100%;border-collapse:collapse;font-size:.88rem;}
th,td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid var(--border);vertical-align:top;white-space:nowrap;}
th{background:var(--surface);font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;}
td.name{white-space:normal;max-width:22rem;}
td.num{text-align:right;font-variant-numeric:tabular-nums;}
tbody tr:last-child td{border-bottom:0;}
tbody tr:hover{background:var(--surface);}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.82rem;}
.dim{color:var(--muted);}
.pill{display:inline-block;padding:.12rem .55rem;border-radius:1rem;font-size:.74rem;font-weight:700;text-transform:capitalize;}
.pill.mikro{background:#E7EEF8;color:#1D4ED8;}
.pill.mali{background:#E0F1E5;color:#2E8540;}
.pill.srednji{background:#FDF1E0;color:#B45309;}
.pill.veliki{background:#F3E8FF;color:#7C3AED;}
.pill.none{background:#ECEFF2;color:#5A6570;}
.tag{display:inline-block;padding:.1rem .5rem;border-radius:.35rem;font-size:.72rem;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--muted);}
.tag.st-pending{background:#F8F3E0;border-color:#EFE3B8;color:#92760a;}
.tag.st-enriched{background:#E0F1E5;border-color:#BFE3CC;color:#2E8540;}
.tag.st-failed{background:#F8E2E0;border-color:#F3C9C5;color:#B42318;}
.lst{display:inline-block;padding:.1rem .5rem;border-radius:.35rem;font-size:.72rem;font-weight:700;}
.lst.aktivan{background:#E0F1E5;color:#2E8540;}
.lst.brisan{background:#F8E2E0;color:#B42318;}
.lst.likvidacija,.lst.stecaj,.lst.predstecaj{background:#FDF1E0;color:#B45309;}
.lst.blokada{background:#F3E8FF;color:#7C3AED;}
.lst.nepoznato,.lst.x{background:#ECEFF2;color:#5A6570;}
.off{color:#2E8540;font-weight:700;font-size:.7rem;}
.conf-low{color:#B45309;font-size:.72rem;font-weight:700;}
.empty{padding:2rem;text-align:center;color:var(--muted);}
.pager{display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-top:.9rem;color:var(--muted);font-size:.85rem;}
.pager button{border:1px solid var(--border);background:var(--bg);border-radius:.4rem;padding:.35rem .7rem;cursor:pointer;}
.pager button:disabled{opacity:.4;cursor:default;}
footer{padding:1.5rem;text-align:center;color:var(--muted);font-size:.8rem;}
</style>`;

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="hr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${BASE_STYLE}</head><body>
<div class="tricolor"><span class="red"></span><span></span><span class="navy"></span></div>
<header>
  <div class="brand">${HEADER_LOGO_SVG}<span class="word">DOMOVINA<span class="accent">.</span>firme</span></div>
  <span class="badge">razvrstavanje veličine poduzetnika</span>
</header>
<main>${body}</main>
<footer>Klasifikacija po Zakonu o računovodstvu (NN 85/24, čl. 5) · izvori: companywall, sudski registar, FINA RGFI, registar udruga</footer>
</body></html>`;
}

/** The grid page shell. Rows are fetched client-side from /admin/api/companies. */
export function renderGridPage(): string {
  const body = `
<h1>Pravne osobe</h1>
<p class="lede">Grid svih subjekata s popisa. Veličina (mikro/mali/srednji/veliki) izračunata iz FINA RGFI bilance ili broja zaposlenih; udruge se ne razvrstavaju nego prati broj zaposlenih.</p>

<div class="stats" id="stats"></div>

<div class="toolbar">
  <input type="search" id="q" placeholder="Pretraži po nazivu ili OIB-u…" autocomplete="off">
  <select id="lstatus">
    <option value="">Svi pravni statusi</option>
    <option value="aktivan">Aktivan</option>
    <option value="brisan">Brisan</option>
    <option value="likvidacija">U likvidaciji</option>
    <option value="stecaj">U stečaju</option>
    <option value="predstecaj">Predstečaj</option>
    <option value="blokada">Blokada</option>
  </select>
  <button id="clear">Očisti filtere</button>
  <span class="spacer"></span>
  <button id="refresh">↻ Osvježi</button>
</div>

<div class="table-wrap">
  <table>
    <thead><tr>
      <th>Naziv</th><th>OIB</th><th>Vrsta</th><th>Veličina</th><th>Pravni status</th>
      <th class="num">Aktiva</th><th class="num">Prihod</th><th class="num">Zapos.</th>
      <th>God.</th><th>Izvor</th><th>Obrada</th>
    </tr></thead>
    <tbody id="rows"><tr><td colspan="11" class="empty">Učitavanje…</td></tr></tbody>
  </table>
</div>
<div class="pager">
  <span id="pginfo"></span>
  <button id="prev">← Prethodno</button>
  <button id="next">Sljedeće →</button>
</div>

<script>
const KIND_LABEL = {trgovacko_drustvo:"Trg. društvo",obrt:"Obrt/OPG",udruga:"Udruga",ustanova:"Ustanova",nepoznato:"—"};
const STAT_DEFS = [
  ["ukupno","Ukupno",""],["pending","Za obradu","s-pending"],
  ["mikro","Mikro","s-mikro"],["mali","Mali","s-mali"],
  ["srednji","Srednji","s-srednji"],["veliki","Veliki","s-veliki"],
  ["udruga","Udruge","s-udruga"],["nerazvrstano","Nerazvrstano",""],["failed","Greška","s-failed"]
];
// Map stat key -> grid filter (size= / status= / kind=)
const STAT_FILTER = {
  ukupno:{}, pending:{status:"pending"}, failed:{status:"failed"},
  mikro:{size:"mikro"}, mali:{size:"mali"}, srednji:{size:"srednji"}, veliki:{size:"veliki"},
  udruga:{size:"udruga"}, nerazvrstano:{size:"nerazvrstano"}
};
let state = {limit:50, offset:0, q:"", filter:"ukupno", lstatus:""};
const eur = n => n==null ? '<span class="dim">—</span>' : Math.round(n).toLocaleString('hr-HR')+' €';
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const LST_LABEL = {aktivan:"Aktivan",brisan:"Brisan",likvidacija:"U likvidaciji",stecaj:"U stečaju",predstecaj:"Predstečaj",blokada:"Blokada",nepoznato:"—"};

function sizeCell(r){
  if(r.kind==='udruga') return '<span class="pill none">udruga</span>';
  if(!r.size) return '<span class="pill none">—</span>';
  const conf = r.confidence==='low' ? ' <span class="conf-low" title="samo 1 kriterij">!</span>' : '';
  const off = r.size_official ? ' <span class="off" title="službena oznaka FINA info.BIZ">✓</span>' : '';
  return '<span class="pill '+r.size+'">'+r.size+'</span>'+off+conf;
}
function lstCell(r){
  if(!r.legal_status) return '<span class="dim">—</span>';
  const cls = LST_LABEL[r.legal_status] ? r.legal_status : 'x';
  return '<span class="lst '+cls+'" title="'+esc(r.legal_status_raw||'')+'">'+(LST_LABEL[r.legal_status]||esc(r.legal_status))+'</span>';
}
function empCell(r){
  if(r.employees!=null) return r.employees;
  if(r.kind==='udruga' && r.has_employees===0) return '0';
  return '<span class="dim">—</span>';
}

async function load(){
  const f = STAT_FILTER[state.filter] || {};
  const p = new URLSearchParams({limit:state.limit, offset:state.offset});
  if(state.q) p.set('q', state.q);
  if(state.lstatus) p.set('lstatus', state.lstatus);
  for(const [k,v] of Object.entries(f)) p.set(k,v);
  const res = await fetch('/admin/api/companies?'+p.toString());
  const data = await res.json();
  renderStats(data.counts);
  renderRows(data.companies);
  const from = data.total===0?0:state.offset+1, to=Math.min(state.offset+state.limit, data.total);
  document.getElementById('pginfo').textContent = from+'–'+to+' od '+data.total;
  document.getElementById('prev').disabled = state.offset<=0;
  document.getElementById('next').disabled = to>=data.total;
}
function renderStats(c){
  document.getElementById('stats').innerHTML = STAT_DEFS.map(([k,lbl,cls])=>
    '<div class="stat '+cls+(state.filter===k?' active':'')+'" data-k="'+k+'"><div class="label">'+lbl+'</div><div class="value">'+(c[k]??0)+'</div></div>'
  ).join('');
  document.querySelectorAll('.stat').forEach(el=>el.onclick=()=>{state.filter=el.dataset.k;state.offset=0;load();});
}
function renderRows(rows){
  const tb = document.getElementById('rows');
  if(!rows.length){tb.innerHTML='<tr><td colspan="11" class="empty">Nema rezultata.</td></tr>';return;}
  tb.innerHTML = rows.map(r=>{
    const name = r.source_url ? '<a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.name||'—')+'</a>' : esc(r.name||'—');
    return '<tr>'+
      '<td class="name">'+name+(r.director?'<div class="dim" style="font-size:.78rem">'+esc(r.director)+'</div>':'')+'</td>'+
      '<td class="mono">'+esc(r.oib)+'</td>'+
      '<td><span class="tag">'+(KIND_LABEL[r.kind]||r.kind)+'</span></td>'+
      '<td>'+sizeCell(r)+'</td>'+
      '<td>'+lstCell(r)+'</td>'+
      '<td class="num">'+eur(r.total_assets)+'</td>'+
      '<td class="num">'+eur(r.revenue)+'</td>'+
      '<td class="num">'+empCell(r)+'</td>'+
      '<td class="dim">'+(r.metrics_year||'—')+'</td>'+
      '<td class="dim mono">'+esc(r.metrics_source||'—')+'</td>'+
      '<td><span class="tag st-'+r.status+'">'+r.status+'</span></td>'+
    '</tr>';
  }).join('');
}

let qt;
document.getElementById('q').addEventListener('input', e=>{clearTimeout(qt);qt=setTimeout(()=>{state.q=e.target.value.trim();state.offset=0;load();},250);});
document.getElementById('lstatus').addEventListener('change', e=>{state.lstatus=e.target.value;state.offset=0;load();});
document.getElementById('clear').onclick=()=>{state.q='';state.filter='ukupno';state.lstatus='';state.offset=0;document.getElementById('q').value='';document.getElementById('lstatus').value='';load();};
document.getElementById('refresh').onclick=load;
document.getElementById('prev').onclick=()=>{state.offset=Math.max(0,state.offset-state.limit);load();};
document.getElementById('next').onclick=()=>{state.offset+=state.limit;load();};
load();
setInterval(load, 15000); // auto-refresh dok bridge obrađuje
</script>`;
  return layout("DOMOVINA.firme — admin", body);
}
