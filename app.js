'use strict';

/* ================= Tabelas de apoio ================= */
const QUAL = {
  '00':'Não informada','05':'Administrador','08':'Conselheiro de Administração','09':'Curador','10':'Diretor','11':'Interventor',
  '12':'Inventariante','13':'Liquidante','14':'Mãe','15':'Pai','16':'Presidente','17':'Procurador','18':'Secretário',
  '19':'Síndico (Condomínio)','20':'Sociedade Consorciada','21':'Sociedade Filiada','22':'Sócio','23':'Sócio Capitalista',
  '24':'Sócio Comanditado','25':'Sócio Comanditário','26':'Sócio de Indústria','28':'Sócio-Gerente','29':'Sócio Incapaz ou Relat. Incapaz',
  '30':'Sócio Menor','31':'Sócio Ostensivo','32':'Tabelião','33':'Tesoureiro','34':'Titular de Empresa Individual Imobiliária','35':'Tutor',
  '37':'Sócio PJ Domiciliado no Exterior','38':'Sócio PF Residente no Exterior','39':'Diplomata','40':'Cônsul',
  '41':'Representante de Organização Internacional','42':'Oficial de Registro','43':'Responsável','46':'Ministro de Estado das Relações Exteriores',
  '47':'Sócio PF Residente no Brasil','48':'Sócio PJ Domiciliado no Brasil','49':'Sócio-Administrador','50':'Empresário',
  '51':'Candidato a Cargo Político Eletivo','52':'Sócio com Capital','53':'Sócio sem Capital','54':'Fundador',
  '55':'Sócio Comanditado Residente no Exterior','56':'Sócio Comanditário PF Residente no Exterior','57':'Sócio Comanditário PJ Domiciliado no Exterior',
  '58':'Sócio Comanditário Incapaz','59':'Produtor Rural','60':'Cônsul Honorário','61':'Responsável Indígena',
  '62':'Representante de Instituição Extraterritorial','63':'Cotas em Tesouraria','64':'Administrador Judicial',
  '65':'Titular PF Residente no Brasil','66':'Titular PF Residente no Exterior','67':'Titular PF Incapaz','68':'Titular PF Menor',
  '69':'Beneficiário Final','70':'Administrador Residente no Exterior','71':'Conselheiro de Administração Residente no Exterior',
  '72':'Diretor Residente no Exterior','73':'Presidente Residente no Exterior','74':'Sócio-Administrador Residente no Exterior',
  '75':'Fundador Residente no Exterior','78':'Titular PJ Domiciliada no Brasil','79':'Titular PJ Domiciliada no Exterior'
};
// sócios estrangeiros (identificador 3) que são pessoa jurídica
const QUAL_PJ_EXTERIOR = new Set(['37','57','79']);
const NATUREZA = {
  '2011':'Empresa Pública','2038':'Sociedade de Economia Mista','2046':'Sociedade Anônima Aberta','2054':'Sociedade Anônima Fechada',
  '2062':'Sociedade Empresária Limitada','2070':'Sociedade Empresária em Nome Coletivo','2089':'Sociedade Empresária em Comandita Simples',
  '2097':'Sociedade Empresária em Comandita por Ações','2127':'Sociedade em Conta de Participação','2135':'Empresário Individual',
  '2143':'Cooperativa','2151':'Consórcio de Sociedades','2160':'Grupo de Sociedades','2178':'Estabelecimento no Brasil de Sociedade Estrangeira',
  '2216':'Empresa Domiciliada no Exterior','2224':'Clube/Fundo de Investimento','2232':'Sociedade Simples Pura','2240':'Sociedade Simples Limitada',
  '2259':'Sociedade Simples em Nome Coletivo','2267':'Sociedade Simples em Comandita Simples','2275':'Empresa Binacional',
  '2283':'Consórcio de Empregadores','2291':'Consórcio Simples','2305':'EIRELI (Natureza Empresária)','2313':'EIRELI (Natureza Simples)',
  '2321':'Sociedade Unipessoal de Advocacia','2330':'Cooperativa de Consumo','2348':'Empresa Simples de Inovação',
  '3069':'Fundação Privada','3220':'Organização Religiosa','3999':'Associação Privada'
};

/* ================= Utilidades ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtN = n => Number(n).toLocaleString('pt-BR');

function limpaDoc(s) { return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
function normaliza(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }

// DV do CNPJ, já compatível com o CNPJ alfanumérico (valor = código do caractere - 48)
function dvCnpj(base12) {
  const v = c => c.charCodeAt(0) - 48;
  const calc = (txt, pesos) => { let s = 0; for (let i = 0; i < pesos.length; i++) s += v(txt[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(base12, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(base12 + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return '' + d1 + d2;
}
function matriz(base8) { const b = base8 + '0001'; return b + dvCnpj(b); }
function fmtCnpj(c) {
  if (c.length === 14) return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
  if (c.length === 8) return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}`;
  return c;
}
function fmtData(d) {
  d = String(d || '').replace(/\D/g, '');
  return d.length === 8 && d !== '00000000' ? `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}` : '';
}
const qualNome = q => { const k = String(q ?? '').trim().padStart(2, '0'); return QUAL[k] || (q ? 'Qualificação ' + q : ''); };
const ehExterior = ch => ch.startsWith('EX:');
// só aceita chaves no formato esperado: raiz de CNPJ (8 caracteres) ou sócia estrangeira "EX:NOME"
const chaveValida = k => typeof k === 'string' && (/^[0-9A-Z]{8}$/.test(k) || /^EX:[^<>]{1,200}$/.test(k));
const cnpjDe = ch => ehExterior(ch) ? 'exterior, sem CNPJ' : fmtCnpj(matriz(ch));
// CNPJ do sócio PJ: em geral 14 caracteres, mas há registros só com a raiz (ex.: empresas estrangeiras) ou sem zeros à esquerda
function chaveSocioPJ(doc) {
  doc = String(doc || '').trim();
  if (!doc || doc.includes('*')) return '';
  const d = limpaDoc(doc);
  if (!/[1-9A-Z]/.test(d)) return '';
  return d.length > 8 ? d.padStart(14, '0') : d.padStart(8, '0');
}
const socBase = k => ehExterior(k) ? k : k.slice(0, 8);

function baixar(nome, partes, tipo) {
  const url = URL.createObjectURL(new Blob(partes, { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ================= Dados online (BrasilAPI / Minha Receita) ================= */
const onlinePromessas = new Map(); const onlineDados = new Map(); const nomesExtra = new Map(); const natExtra = new Map();
let ativos = 0; const fila = [];
const pegaVaga = () => new Promise(r => { if (ativos < 3) { ativos++; r(); } else fila.push(r); });
const soltaVaga = () => { const nx = fila.shift(); if (nx) nx(); else ativos--; };

async function buscaApis(cnpj) {
  const urls = [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, `https://minhareceita.org/${cnpj}`];
  for (const u of urls) {
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (r.ok) return await r.json();
        if (r.status === 429 || r.status >= 500) { await sleep(1500 * (t + 1)); continue; }
        break;
      } catch { break; }
    }
  }
  return null;
}
function consultaOnline(base) {
  if (ehExterior(base)) return Promise.resolve(null);
  if (!onlinePromessas.has(base)) {
    onlinePromessas.set(base, (async () => {
      await pegaVaga();
      try { const d = await buscaApis(matriz(base)); if (d) onlineDados.set(base, d); return d; }
      finally { soltaVaga(); }
    })());
  }
  return onlinePromessas.get(base);
}

/* ================= Nomes e dados de cada empresa ================= */
function nomeDe(ch) {
  if (ehExterior(ch)) return nomesExtra.get(ch) || ch.slice(3);
  const o = onlineDados.get(ch); if (o && o.razao_social) return o.razao_social;
  return nomesExtra.get(ch) || '';
}
function naturezaDe(ch) {
  const o = onlineDados.get(ch);
  if (o && o.natureza_juridica) return String(o.natureza_juridica).replace(/^\d{3}-?\d\s*-\s*/, '');
  const cod = natExtra.get(ch);
  return cod ? (NATUREZA[cod] || 'Natureza ' + cod) : '';
}
function situacaoHtml(ch) {
  const o = onlineDados.get(ch); if (!o) return '';
  const s = String(o.descricao_situacao_cadastral || '').toUpperCase(); if (!s) return '';
  const txt = esc(s.charAt(0) + s.slice(1).toLowerCase());
  return s === 'ATIVA' ? txt : `<span class="erro">${txt}</span>`;
}
function localDe(ch) { const o = onlineDados.get(ch); if (!o || !o.municipio) return ''; return `${o.municipio}${o.uf ? '/' + o.uf : ''}`; }

// "sobe" sem a base: lê o QSA online, nível a nível
async function vizSobeOnline(ch) {
  if (ehExterior(ch)) return [];
  const d = await consultaOnline(ch); if (!d || !Array.isArray(d.qsa)) return [];
  const m = new Map();
  for (const s of d.qsa) {
    const id = Number(s.identificador_de_socio), q = String(s.codigo_qualificacao_socio ?? '').padStart(2, '0');
    const doc = id === 1 ? chaveSocioPJ(s.cnpj_cpf_do_socio) : '';
    let k;
    if (doc) { k = doc.slice(0, 8); if (!nomesExtra.has(k)) nomesExtra.set(k, s.nome_socio || ''); }
    else if (id === 1 || (id === 3 && QUAL_PJ_EXTERIOR.has(q))) { k = 'EX:' + normaliza(s.nome_socio); nomesExtra.set(k, s.nome_socio || ''); }
    else continue;
    if (k === ch || !chaveValida(k)) continue;
    let o = m.get(k); if (!o) { o = { chave: k, quals: new Set(), data: s.data_entrada_sociedade || '' }; m.set(k, o); }
    o.quals.add(q);
  }
  return ordena([...m.values()]);
}
vizSobeOnline.online = true;

/* ================= Base de dados (API estática no GitHub Pages) ================= */
// Endereço da API publicada; usado quando a página não está no próprio GitHub Pages
const NUVEM_PADRAO = 'https://madalzotto.github.io/participacoes-societarias/api/';
const STOP_PADRAO = ['LTDA','LTD','SA','ME','EPP','EIRELI','DE','DA','DO','DAS','DOS','E','EM','COMERCIO','SERVICOS','PARTICIPACOES',
  'EMPREENDIMENTOS','INDUSTRIA','BRASIL','HOLDING','EMPRESA','GRUPO','ADMINISTRACAO','INVESTIMENTOS','CIA','COMPANHIA','SOCIEDADE',
  'LIMITADA','THE','OF','AND','INC','LLC','CO'];
const Nuvem = { url: null, meta: null, versao: '', ext: '.json', fatias: new Map() };
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const mesExtenso = m => { const r = /^(\d{4})-(\d{2})$/.exec(m || ''); return r ? `${MESES[+r[2] - 1]}/${r[1]}` : ''; };
const temBase = () => !!Nuvem.url;

async function detectaNuvem() {
  const urls = [];
  if (/^https?:$/.test(location.protocol)) urls.push(new URL('api/', location.href).href);
  if (!urls.includes(NUVEM_PADRAO)) urls.push(NUVEM_PADRAO);
  for (const u of urls) {
    try {
      const r = await fetch(u + 'meta.json', { cache: 'no-cache' });
      if (!r.ok) continue;
      const meta = await r.json();
      if (!meta || typeof meta !== 'object' || !mesExtenso(meta.mes)) continue;
      Nuvem.meta = meta; Nuvem.url = u; Nuvem.versao = encodeURIComponent(meta.geradoEm || '');
      Nuvem.ext = meta.formato === 'json.gz' ? '.json.gz' : '.json';
      return true;
    } catch { /* sem internet ou API fora do ar */ }
  }
  return false;
}

function guardaNome(k, nome, nat) {
  if (nome && !nomesExtra.has(k)) nomesExtra.set(k, String(nome));
  if (nat) natExtra.set(k, String(nat));
}
// baixa um arquivo da API; os .json.gz são descompactados aqui (o GitHub Pages entrega o arquivo como está)
async function baixaJson(caminho) {
  const r = await fetch(`${Nuvem.url}${caminho}${Nuvem.ext}?v=${Nuvem.versao}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const b = new Uint8Array(await r.arrayBuffer());
  const txt = b[0] === 0x1f && b[1] === 0x8b
    ? await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(b);
  return JSON.parse(txt);
}
const FATIA_VAZIA = { n: {}, p: {}, c: {} };
function fatia(ch) {
  const p = ehExterior(ch) ? 'ex' : ch.slice(0, 3);
  if (!Nuvem.fatias.has(p)) {
    Nuvem.fatias.set(p, baixaJson('s/' + encodeURIComponent(p))
      .then(d => {
        d = d && typeof d === 'object' ? d : FATIA_VAZIA;
        for (const [k, v] of Object.entries(d.n || {})) if (chaveValida(k) && Array.isArray(v)) guardaNome(k, v[0], v[1]);
        return d;
      })
      .catch(e => { Nuvem.fatias.delete(p); throw e; }));
  }
  return Nuvem.fatias.get(p);
}
// itens das listas: [chave, qualificação, data de entrada, nome, natureza, quantas ligações a chave tem no mesmo sentido]
function agrupa(itens, ch, chaveDe) {
  const m = new Map();
  for (const item of Array.isArray(itens) ? itens : []) {
    if (!Array.isArray(item)) continue;
    const [k0, qual, data, nome, nat, mais] = item;
    const k = chaveDe(String(k0 || '')); if (k === ch || !chaveValida(k)) continue;
    guardaNome(k, nome, nat);
    let o = m.get(k); if (!o) { o = { chave: k, quals: new Set(), data: String(data || ''), mais: Number(mais) || 0 }; m.set(k, o); }
    o.quals.add(String(qual || ''));
  }
  return ordena([...m.values()]);
}
async function vizDesceNuvem(ch) { const d = await fatia(ch); return agrupa((d.p || {})[ch], ch, k => k); }
async function vizSobeNuvem(ch) { if (ehExterior(ch)) return []; const d = await fatia(ch); return agrupa((d.c || {})[ch], ch, socBase); }

const normalizaBusca = s => normaliza(s).replace(/[^A-Z0-9]+/g, ' ').trim();
async function buscaPorNomeNuvem(q) {
  const stop = new Set(Array.isArray(Nuvem.meta.stop) ? Nuvem.meta.stop : STOP_PADRAO);
  const nq = normalizaBusca(q);
  const toks = [...new Set(nq.split(' ').filter(t => t.length >= 2))];
  const uteis = toks.filter(t => !stop.has(t));
  const alvo = (uteis.length ? uteis : toks).sort((a, b) => b.length - a.length)[0];
  if (!alvo) return { lista: [], aviso: 'Digite ao menos uma palavra do nome com 2 letras ou mais.' };
  const dados = (await baixaJson('b/' + encodeURIComponent(alvo.slice(0, 2)))) || [];
  const lista = [];
  for (const item of Array.isArray(dados) ? dados : []) {
    if (!Array.isArray(item)) continue;
    const [chave, nome, desce, sobe] = item;
    if (!chaveValida(chave) || !normalizaBusca(nome).includes(nq)) continue;
    guardaNome(chave, nome);
    lista.push({ chave, nome: String(nome), desce: Number(desce) || 0, sobe: Number(sobe) || 0 });
    if (lista.length >= 100) break;
  }
  return { lista, aviso: uteis.length ? '' : 'Você usou só palavras muito comuns (como LTDA, HOLDING, PARTICIPAÇÕES). Acrescente uma palavra mais específica do nome para achar todas as empresas.' };
}

function ordena(l) {
  for (const o of l) o.quals = [...o.quals];
  return l.sort((a, b) => (nomeDe(a.chave) || '~' + a.chave).localeCompare(nomeDe(b.chave) || '~' + b.chave, 'pt-BR'));
}

const LIMITE_NOS = 3000;
async function montaArvore(raiz, viz, prof, aoProgredir) {
  const vistos = new Set([raiz]); const linhas = []; let total = 0, cortado = false;
  async function expande(ch, nivel, caminho) {
    const lst = await viz(ch); const out = [];
    for (const v of lst) {
      if (total >= LIMITE_NOS) { cortado = true; break; }
      total++;
      const no = { chave: v.chave, quals: v.quals, data: v.data, nivel, filhos: [], ciclo: caminho.has(v.chave), repetido: false, temMais: false, pai: ch };
      linhas.push(no);
      if (!no.ciclo) {
        if (vistos.has(v.chave)) no.repetido = true;
        else {
          vistos.add(v.chave);
          if (nivel < prof) { caminho.add(v.chave); no.filhos = await expande(v.chave, nivel + 1, caminho); caminho.delete(v.chave); }
          else if (v.mais !== undefined) no.temMais = v.mais > 0;
        }
      }
      out.push(no);
      if (aoProgredir) aoProgredir(total);
    }
    return out;
  }
  const filhos = await expande(raiz, 1, new Set([raiz]));
  return { raiz, filhos, linhas, total, cortado, distintas: vistos.size - 1 };
}

/* ================= Pesquisa ================= */
let buscaAtual = 0; let ultima = null;
const $res = $('#res');

function direcao() { return document.querySelector('input[name=dir]:checked').value === 'sobe' ? 'sobe' : 'desce'; }

function interpreta(txt) {
  const doc = limpaDoc(txt);
  if (/^[0-9A-Z]{12}\d{2}$/.test(doc) && /\d/.test(txt)) {
    if (dvCnpj(doc.slice(0, 12)) === doc.slice(12)) return { chave: doc.slice(0, 8) };
    if (/^[\d.\/\-\s]+$/.test(txt)) return { erro: 'CNPJ inválido: os dígitos verificadores não conferem.' };
  }
  if (/^[0-9A-Z]{8}$/.test(doc) && /\d/.test(doc) && /^[0-9A-Za-z.\-\s]+$/.test(txt) && !/[A-Za-z]{3,}\s/.test(txt)) return { chave: doc };
  return { nome: txt };
}

function atualizaStatus() {
  const el = $('#status'); const nm = Nuvem.meta;
  if (nm) {
    el.textContent = `Dados da Receita Federal de ${mesExtenso(nm.mes)}, com ${fmtN(nm.vinculos)} vínculos entre ${fmtN(nm.empresas)} empresas.`;
    const g = new Date(nm.geradoEm);
    el.title = isNaN(g) ? '' : 'Gerada em ' + g.toLocaleString('pt-BR');
  } else {
    el.textContent = 'Base de dados indisponível no momento. Só a consulta de empresas sócias funciona, pelo QSA na internet.';
  }
}

async function pesquisar() {
  const txt = $('#q').value.trim().slice(0, 120); if (!txt) { $('#q').focus(); return; }
  const r = interpreta(txt);
  if (r.erro) { $res.innerHTML = `<p class="erro">${esc(r.erro)}</p>`; return; }
  if (r.chave) return executa(r.chave, direcao());
  if (!temBase()) {
    $res.innerHTML = `<p class="warn">A pesquisa por nome precisa da base de dados, que não está disponível agora. Pesquise pelo CNPJ.</p>`;
    return;
  }
  const token = ++buscaAtual;
  $res.innerHTML = `<p class="carregando">Pesquisando "${esc(txt)}"...</p>`;
  try {
    const r2 = await buscaPorNomeNuvem(txt);
    if (token === buscaAtual) mostraCandidatos(r2.lista, txt, r2.aviso);
  } catch (e) { if (token === buscaAtual) erroNuvem(e); }
}

function erroNuvem(e) {
  console.warn(e);
  $res.innerHTML = `<p class="erro">Não foi possível consultar a base de dados (${esc(e.message)}). Verifique a conexão com a internet e tente de novo.</p>`;
}

const plural = (n, um, varios) => `${fmtN(n)} ${n === 1 ? um : varios}`;
const linkIr = (ch, dir, texto, titulo) =>
  `<a href="#" data-acao="ir" data-chave="${esc(ch)}" data-dir="${dir}"${titulo ? ` title="${esc(titulo)}"` : ''}>${texto}</a>`;

function mostraCandidatos(lst, q, aviso) {
  const avisoHtml = aviso ? `<p class="warn">${esc(aviso)}</p>` : '';
  if (!lst.length) {
    $res.innerHTML = `${avisoHtml}<p>Nenhuma empresa com "${esc(q)}" no nome foi encontrada entre as empresas que têm sócias ou são sócias de outras.
      Confira a grafia ou pesquise pelo CNPJ.</p>`;
    return;
  }
  const linhas = lst.map(c => `<tr>
    <td>${esc(c.nome)}</td>
    <td class="cnpj">${esc(ehExterior(c.chave) ? 'exterior' : cnpjDe(c.chave))}</td>
    <td>${c.desce ? linkIr(c.chave, 'desce', plural(c.desce, 'empresa', 'empresas')) : '-'}</td>
    <td>${c.sobe ? linkIr(c.chave, 'sobe', plural(c.sobe, 'empresa', 'empresas')) : '-'}</td>
  </tr>`).join('');
  $res.innerHTML = `<h2>Resultados para "${esc(q)}"</h2>${avisoHtml}
    <p>${lst.length === 100 ? 'Mostrando os 100 primeiros resultados.' : plural(lst.length, 'empresa encontrada.', 'empresas encontradas.')} Clique no número para ver a árvore.</p>
    <div class="rolagem"><table class="dados">
      <tr><th>Razão social</th><th>CNPJ</th><th>É sócia de</th><th>Sócias PJ</th></tr>${linhas}
    </table></div>`;
}

async function executa(chave, dir) {
  if (!chaveValida(chave)) return;
  const token = ++buscaAtual;
  const prof = Math.min(10, Math.max(1, +$('#niveis').value || 3));
  const usarOnline = $('#online').checked;
  const semBase = !temBase();
  if (dir === 'desce' && semBase) {
    $res.innerHTML = `<p class="warn">Para listar as empresas das quais um CNPJ é sócio é preciso a base de dados, que não está disponível agora
      (sem internet ou fora do ar). A opção "empresas que são sócias dela" funciona sem a base, consultando o QSA pela internet.</p>`;
    return;
  }
  document.querySelector(`input[name=dir][value=${dir}]`).checked = true;
  const viz = dir === 'desce' ? vizDesceNuvem : (semBase ? vizSobeOnline : vizSobeNuvem);
  $res.innerHTML = `<p id="carregando" class="carregando">Pesquisando...</p>`;
  if (semBase || usarOnline) consultaOnline(chave);
  let arv;
  try {
    if (!semBase) await fatia(chave);                      // nome da empresa pesquisada
    else await consultaOnline(chave);
    arv = await montaArvore(chave, viz, prof, n => {
      if (token !== buscaAtual) return;
      const c = $('#carregando'); if (c) c.textContent = viz.online ? `Consultando o QSA pela internet... ${n} empresa(s) encontrada(s)` : `Pesquisando... ${n} empresa(s)`;
    });
  } catch (e) { if (token === buscaAtual) erroNuvem(e); return; }
  if (token !== buscaAtual) return;
  ultima = { arv, dir, prof, semBase };
  renderResultado(arv, dir, prof, semBase);
  if (usarOnline || semBase) enriquece(arv, token);
}

/* ================= Resultado ================= */
// dados de uma empresa numa linha discreta: CNPJ, extra (qualificação), e o que chega depois (natureza, situação, município)
function metaNo(ch, extra) {
  const nat = naturezaDe(ch), sit = situacaoHtml(ch), loc = localDe(ch);
  return `<span class="meta"><span class="cnpj">${esc(cnpjDe(ch))}</span>${extra || ''}`
    + `<span class="nat">${nat ? ', ' + esc(nat) : ''}</span><span class="sit">${sit ? ', ' + sit : ''}</span><span class="loc">${loc ? ', ' + esc(loc) : ''}</span></span>`;
}
// nome (link para pesquisar a partir dele) e, embaixo, os dados
function linhaNo(ch, dir, extra) {
  const nm = nomeDe(ch);
  return `<a href="#" class="nm" data-acao="ir" data-chave="${esc(ch)}" data-dir="${dir}" title="Pesquisar a partir desta empresa">${nm ? esc(nm) : '(nome não disponível)'}</a>`
    + metaNo(ch, extra);
}

function htmlNo(no, dir) {
  const quals = (no.quals || []).map(qualNome).filter(Boolean).join(' / ');
  const data = fmtData(no.data);
  const desc = (quals || 'Sócio') + (data ? ' desde ' + data : '');
  const obs = no.ciclo ? 'participação cruzada: esta empresa já aparece acima'
    : no.repetido ? 'já listada em outro ponto da árvore'
    : no.temMais ? `tem mais ${dir === 'desce' ? 'participações' : 'sócias'}; aumente o número de níveis` : '';
  const linha = `<span data-no="${esc(no.chave)}">${linhaNo(no.chave, dir, ', ' + esc(desc))}</span>${obs ? `<span class="obs">${obs}</span>` : ''}`;
  if (!no.filhos.length) return `<li>${linha}</li>`;
  return `<li class="grupo"><details${no.nivel < 3 ? ' open' : ''}><summary>${linha}</summary><ul>${no.filhos.map(f => htmlNo(f, dir)).join('')}</ul></details></li>`;
}

function renderResultado(arv, dir, prof, semBase) {
  const diretos = arv.filhos.length;
  const desce = dir === 'desce';
  const raiz = arv.raiz;
  const cab = `<div data-no="${esc(raiz)}">
      <h2 class="nm">${esc(nomeDe(raiz) || '(nome não disponível)')}</h2>
      ${metaNo(raiz, '')}
    </div>`;
  let corpo;
  if (!diretos) {
    corpo = desce
      ? `<p class="resumo">Nenhuma empresa tem este CNPJ como sócio na base de dados.</p>
         <p class="cinza">Possíveis motivos: a empresa não tem participações; as participações são em sociedades anônimas (a Receita não lista acionistas);
         ou a participação é mais recente que a última publicação da Receita.</p>`
      : `<p class="resumo">Nenhum sócio pessoa jurídica encontrado.</p>
         <p class="cinza">Os sócios desta empresa são pessoas físicas, ou ela não tem quadro societário na Receita (por exemplo, empresário individual ou S.A. que só lista diretores).</p>`;
  } else {
    const resumo = desce
      ? `É sócia de ${plural(diretos, 'empresa', 'empresas')} diretamente`
      : `Tem ${plural(diretos, 'sócia', 'sócias')} pessoa jurídica`;
    corpo = `
      <p class="resumo">${resumo}; ${plural(arv.distintas, 'empresa', 'empresas')} ao todo, em até ${plural(prof, 'nível', 'níveis')}.</p>
      <div class="acoes">
        <a href="#" data-vis="arvore" class="ativo">Lista</a>
        <a href="#" data-vis="tabela">Tabela</a>
        <a href="#" data-acao="expandir">Expandir tudo</a>
        <a href="#" data-acao="recolher">Recolher</a>
        <a href="#" data-acao="csv">Exportar CSV</a>
        <span id="infoOnline" class="cinza"></span>
      </div>
      <div id="vArvore"><ul class="arvore">${arv.filhos.map(f => htmlNo(f, dir)).join('')}</ul></div>
      <div id="vTabela" hidden>${tabelaHtml(arv, dir)}</div>
      ${arv.cortado ? `<p class="warn">A árvore passou de ${fmtN(LIMITE_NOS)} empresas e foi cortada. Reduza o número de níveis ou pesquise a partir de um ramo.</p>` : ''}`;
  }
  $res.innerHTML = cab
    + (semBase ? '<p class="warn">Base de dados indisponível: as sócias foram buscadas no QSA pela internet, uma a uma.</p>' : '')
    + corpo;
}

function tabelaHtml(arv, dir) {
  const desce = dir === 'desce';
  const rows = arv.linhas.map(l => `<tr data-no="${esc(l.chave)}">
    <td>${l.nivel}</td>
    <td class="cnpj">${esc(ehExterior(l.chave) ? 'exterior' : cnpjDe(l.chave))}</td>
    <td>${linkIr(l.chave, dir, `<span class="nm">${esc(nomeDe(l.chave) || '(nome não disponível)')}</span>`, 'Pesquisar a partir desta empresa')}${l.ciclo ? ' <span class="cinza">(cruzada)</span>' : l.repetido ? ' <span class="cinza">(repetida)</span>' : ''}</td>
    <td><span data-no="${esc(l.pai)}"><span class="nm">${esc(nomeDe(l.pai))}</span></span><br><span class="cnpj cinza">${ehExterior(l.pai) ? '' : esc(cnpjDe(l.pai))}</span></td>
    <td>${esc((l.quals || []).map(qualNome).join(' / '))}</td>
    <td>${fmtData(l.data)}</td>
    <td><span class="sit">${situacaoHtml(l.chave)}</span></td>
    <td><span class="loc">${esc(localDe(l.chave))}</span></td>
  </tr>`).join('');
  return `<div class="rolagem"><table class="dados"><tr><th>Nível</th><th>CNPJ</th><th>Razão social</th><th>${desce ? 'Sócia direta' : 'É sócia de'}</th><th>Qualificação</th><th>Desde</th><th>Situação</th><th>Município/UF</th></tr>${rows}</table></div>`;
}

// atualiza nome/situação/município dos elementos [data-no] já desenhados
function preencheNos(ch) {
  const sel = ch ? `[data-no="${CSS.escape(ch)}"]` : '[data-no]';
  for (const el of $res.querySelectorAll(sel)) {
    const k = el.dataset.no;
    const meus = cls => [...el.querySelectorAll('.' + cls)].filter(x => x.closest('[data-no]') === el);
    const sep = el.tagName === 'TR' ? '' : ', ';
    const nm = nomeDe(k);
    for (const x of meus('nm')) if (nm) x.textContent = nm;
    for (const x of meus('sit')) { const s = situacaoHtml(k); x.innerHTML = s ? sep + s : ''; }
    for (const x of meus('loc')) { const l = localDe(k); x.textContent = l ? sep + l : ''; }
    for (const x of meus('nat')) { const n = naturezaDe(k); x.textContent = n ? sep + n : ''; }
  }
}

async function enriquece(arv, token) {
  const chaves = [arv.raiz, ...arv.linhas.map(l => l.chave)].filter(c => !ehExterior(c));
  const lista = [...new Set(chaves)];
  const max = 500; const alvo = lista.slice(0, max);
  const info = () => $('#infoOnline');
  let feitos = 0, falhas = 0;
  await Promise.all(alvo.map(async c => {
    const d = await consultaOnline(c);
    if (token !== buscaAtual) return;
    feitos++; if (!d) falhas++;
    const el = info(); if (el) el.textContent = feitos < alvo.length ? `Consultando BrasilAPI: ${feitos} de ${alvo.length}` : '';
    preencheNos(c);
  }));
  if (token !== buscaAtual) return;
  const el = info();
  const partes = [];
  if (falhas) partes.push(`${falhas} sem dados na BrasilAPI`);
  if (lista.length > max) partes.push(`BrasilAPI consultada só para as ${max} primeiras`);
  if (el) el.textContent = partes.join('; ');
}

function exportaCsv() {
  if (!ultima) return;
  const { arv, dir } = ultima; const desce = dir === 'desce';
  // aspas quando preciso, e um apóstrofo antes de =, +, - ou @ para o Excel não tratar o texto como fórmula
  const cel = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const cab = ['Nível', 'CNPJ', 'Razão social', desce ? 'Sócia direta - CNPJ' : 'É sócia de - CNPJ', desce ? 'Sócia direta - nome' : 'É sócia de - nome',
    'Qualificação', 'Data de entrada', 'Natureza jurídica', 'Situação', 'Município/UF', 'Observação'];
  const cnpjCsv = c => ehExterior(c) ? 'Exterior' : fmtCnpj(matriz(c));
  const linhas = [cab.map(cel).join(';')];
  linhas.push(['0', cnpjCsv(arv.raiz), nomeDe(arv.raiz), '', '', '', '', naturezaDe(arv.raiz), onlineDados.get(arv.raiz)?.descricao_situacao_cadastral || '', localDe(arv.raiz), 'Empresa pesquisada'].map(cel).join(';'));
  for (const l of arv.linhas) {
    linhas.push([l.nivel, cnpjCsv(l.chave), nomeDe(l.chave), cnpjCsv(l.pai), nomeDe(l.pai), (l.quals || []).map(qualNome).join(' / '), fmtData(l.data),
      naturezaDe(l.chave), onlineDados.get(l.chave)?.descricao_situacao_cadastral || '', localDe(l.chave),
      l.ciclo ? 'Participação cruzada' : l.repetido ? 'Repetida (já listada em outro ramo)' : ''].map(cel).join(';'));
  }
  baixar(`${desce ? 'participacoes' : 'socias'}_${ehExterior(arv.raiz) ? 'exterior' : matriz(arv.raiz)}.csv`, ['﻿' + linhas.join('\r\n')], 'text/csv;charset=utf-8');
}

/* ================= Eventos ================= */
$('#form').addEventListener('submit', e => { e.preventDefault(); pesquisar(); });

$res.addEventListener('click', e => {
  const vis = e.target.closest('[data-vis]');
  if (vis) {
    e.preventDefault();
    for (const a of $res.querySelectorAll('[data-vis]')) a.classList.toggle('ativo', a === vis);
    $('#vArvore').hidden = vis.dataset.vis !== 'arvore'; $('#vTabela').hidden = vis.dataset.vis !== 'tabela';
    return;
  }
  const b = e.target.closest('[data-acao]'); if (!b) return;
  e.preventDefault();                                     // evita seguir o link e abrir/fechar o <details>
  const ch = b.dataset.chave;
  switch (b.dataset.acao) {
    case 'ir':
      if (!chaveValida(ch)) return;
      $('#q').value = ehExterior(ch) ? nomeDe(ch) : fmtCnpj(matriz(ch));
      executa(ch, b.dataset.dir === 'sobe' ? 'sobe' : 'desce');
      window.scrollTo({ top: $res.offsetTop - 8 });
      break;
    case 'expandir': for (const d of $res.querySelectorAll('ul.arvore details')) d.open = true; break;
    case 'recolher': for (const d of $res.querySelectorAll('ul.arvore details')) d.open = false; break;
    case 'csv': exportaCsv(); break;
  }
});

/* ---------- modo claro / escuro ----------
   Sem escolha salva, segue o navegador/sistema. Ao escolher o mesmo tema do sistema, a escolha é apagada
   e a página volta a acompanhar o sistema. */
const midiaEscuro = matchMedia('(prefers-color-scheme: dark)');
const temaSistema = () => midiaEscuro.matches ? 'escuro' : 'claro';
const temaAtual = () => document.documentElement.dataset.tema || temaSistema();
function mostraBotaoTema() {
  const escuro = temaAtual() === 'escuro';
  $('#btnTema').textContent = escuro ? 'Modo claro' : 'Modo escuro';
  $('#btnTema').title = document.documentElement.dataset.tema ? 'Tema escolhido por você' : 'Seguindo o tema do sistema';
}
$('#btnTema').addEventListener('click', () => {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  const raiz = document.documentElement;
  if (novo === temaSistema()) { delete raiz.dataset.tema; try { localStorage.removeItem('tema'); } catch { /* ignora */ } }
  else { raiz.dataset.tema = novo; try { localStorage.setItem('tema', novo); } catch { /* ignora */ } }
  mostraBotaoTema();
});
midiaEscuro.addEventListener('change', mostraBotaoTema);
mostraBotaoTema();

// versões antigas da página guardavam no navegador uma base carregada de arquivos; ela não é mais usada
try { indexedDB.deleteDatabase('participacoes-cnpj'); } catch { /* ignora */ }

(async () => {
  await detectaNuvem();
  atualizaStatus();
})();
