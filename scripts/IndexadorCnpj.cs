// Gera a "API" estática de participações societárias a partir dos arquivos abertos da Receita.
// Lê Socios*.zip (obrigatório) e Empresas*.zip (nomes) e grava fatias .json em <saida>:
//   s/<3 primeiros caracteres da raiz>.json.gz-> { n: nomes, p: participações (desce), c: sócias PJ (sobe) }
//   s/ex.json.gz                             -> sócias estrangeiras sem CNPJ (chave "EX:NOME")
//   b/<2 primeiras letras da palavra>.json.gz-> busca por nome
//   meta.json                                -> mês, contagens, data de geração
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

public static class IndexadorCnpj
{
    static readonly Encoding Latin1 = Encoding.Latin1;
    // sócios estrangeiros (identificador 3) que são pessoa jurídica
    static readonly HashSet<string> QualPjExterior = new HashSet<string> { "37", "57", "79" };
    // palavras comuns demais para servir de entrada na busca por nome (a página usa a mesma lista)
    public static readonly HashSet<string> Stop = new HashSet<string> {
        "LTDA", "LTD", "SA", "ME", "EPP", "EIRELI", "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "COMERCIO", "SERVICOS",
        "PARTICIPACOES", "EMPREENDIMENTOS", "INDUSTRIA", "BRASIL", "HOLDING", "EMPRESA", "GRUPO", "ADMINISTRACAO",
        "INVESTIMENTOS", "CIA", "COMPANHIA", "SOCIEDADE", "LIMITADA", "THE", "OF", "AND", "INC", "LLC", "CO"
    };

    sealed class Rel { public string Emp, Soc, Qual, Data; }

    static readonly Stopwatch Relogio = new Stopwatch();
    static void Log(string s) { Console.WriteLine("[" + Relogio.Elapsed.ToString(@"mm\:ss") + "] " + s); }

    public static string Executar(string[] socios, string[] empresas, string saida, string mes)
    {
        Relogio.Restart();
        // ---------- 1. Sócios: só vínculos em que o sócio é pessoa jurídica ----------
        var rels = new List<Rel>();
        var vistos = new HashSet<string>();
        var nomesSocio = new Dictionary<string, string>();
        long linhas = 0;
        foreach (var arq in socios)
        {
            foreach (var linha in Linhas(arq))
            {
                linhas++;
                int pv = linha.IndexOf(';');
                if (pv < 0 || pv + 2 >= linha.Length) continue;
                char c = linha[pv + 1];
                if (c == '"') c = linha[pv + 2];
                if (c != '1' && c != '3') continue;                  // 1 = PJ, 3 = estrangeiro
                var f = ParseLinha(linha);
                if (f.Count < 6) continue;
                string emp = LimpaDoc(f[0]);
                if (emp.Length != 8) continue;
                string qual = f[4].Trim();
                string chave = c == '1' ? ChaveSocioPJ(f[3]) : "";
                if (chave.Length == 0)
                {
                    if (c == '3' && !QualPjExterior.Contains(qual.PadLeft(2, '0'))) continue;
                    string nm = Normaliza(f[2]);
                    if (nm.Length == 0) continue;
                    chave = "EX:" + nm;
                }
                if (!vistos.Add(emp + "|" + chave + "|" + qual)) continue;
                rels.Add(new Rel { Emp = emp, Soc = chave, Qual = qual, Data = f[5].Trim() });
                if (!nomesSocio.ContainsKey(chave)) nomesSocio[chave] = f[2].Trim();
            }
            Log(Path.GetFileName(arq) + ": " + linhas.ToString("N0") + " linhas lidas, " + rels.Count.ToString("N0") + " vínculos entre empresas");
        }
        vistos = null;
        if (rels.Count == 0) throw new Exception("Nenhum vínculo encontrado nos arquivos de Sócios.");

        // ---------- 2. Empresas: razão social e natureza jurídica só das raízes envolvidas ----------
        var precisa = new HashSet<string>();
        foreach (var r in rels) { precisa.Add(r.Emp); if (!EhExterior(r.Soc)) precisa.Add(r.Soc.Substring(0, 8)); }
        var info = new Dictionary<string, string[]>();
        linhas = 0;
        foreach (var arq in empresas)
        {
            foreach (var linha in Linhas(arq))
            {
                linhas++;
                int a = linha.Length > 0 && linha[0] == '"' ? 1 : 0;
                if (linha.Length < a + 8) continue;
                string b = linha.Substring(a, 8);
                if (!precisa.Contains(b)) continue;
                var f = ParseLinha(linha);
                info[b] = new[] { f.Count > 1 ? f[1].Trim() : "", f.Count > 2 ? f[2].Trim() : "" };
            }
            Log(Path.GetFileName(arq) + ": " + linhas.ToString("N0") + " linhas lidas, " + info.Count.ToString("N0") + " razões sociais");
        }

        var nomeBase = new Dictionary<string, string>();
        foreach (var kv in nomesSocio)
            if (!EhExterior(kv.Key)) { var b = kv.Key.Substring(0, 8); if (!nomeBase.ContainsKey(b)) nomeBase[b] = kv.Value; }
        Func<string, string> Nome = k =>
        {
            string v;
            if (EhExterior(k)) return nomesSocio.TryGetValue(k, out v) ? v : k.Substring(3);
            string[] e;
            if (info.TryGetValue(k, out e) && e[0].Length > 0) return e[0];
            return nomeBase.TryGetValue(k, out v) ? v : "";
        };
        Func<string, string> Nat = k => { string[] e; return info.TryGetValue(k, out e) ? e[1] : ""; };

        // ---------- 3. Índices nos dois sentidos ----------
        var desce = new Dictionary<string, List<Rel>>();   // sócia -> empresas em que participa
        var sobe = new Dictionary<string, List<Rel>>();    // empresa -> sócias PJ
        foreach (var r in rels) { Add(desce, SB(r.Soc), r); Add(sobe, r.Emp, r); }
        var nDesce = new Dictionary<string, int>();
        foreach (var kv in desce) nDesce[kv.Key] = kv.Value.Where(x => x.Emp != kv.Key).Select(x => x.Emp).Distinct().Count();
        var nSobe = new Dictionary<string, int>();
        foreach (var kv in sobe) nSobe[kv.Key] = kv.Value.Select(x => SB(x.Soc)).Where(s => s != kv.Key).Distinct().Count();
        Func<string, int> ND = k => { int n; return nDesce.TryGetValue(k, out n) ? n : 0; };
        Func<string, int> NS = k => { int n; return nSobe.TryGetValue(k, out n) ? n : 0; };

        var entidades = new HashSet<string>(desce.Keys);
        entidades.UnionWith(sobe.Keys);
        var fatias = new Dictionary<string, List<string>>();
        foreach (var k in entidades) Add(fatias, EhExterior(k) ? "ex" : k.Substring(0, 3), k);

        // ---------- 4. Gravação ----------
        if (Directory.Exists(saida)) Directory.Delete(saida, true);
        Directory.CreateDirectory(Path.Combine(saida, "s"));
        Directory.CreateDirectory(Path.Combine(saida, "b"));
        var opcoes = new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        long bytes = 0;

        foreach (var g in fatias)
        {
            var chaves = g.Value.OrderBy(x => x, StringComparer.Ordinal).ToList();
            string arq = Path.Combine(saida, "s", g.Key + ".json.gz");
            using (var fs = File.Create(arq))
            using (var gz = new GZipStream(fs, CompressionLevel.Optimal))
            using (var w = new Utf8JsonWriter(gz, opcoes))
            {
                w.WriteStartObject();
                w.WriteStartObject("n");
                foreach (var k in chaves) { w.WriteStartArray(k); w.WriteStringValue(Nome(k)); w.WriteStringValue(Nat(k)); w.WriteEndArray(); }
                w.WriteEndObject();
                w.WriteStartObject("p");
                foreach (var k in chaves)
                {
                    List<Rel> l;
                    if (!desce.TryGetValue(k, out l)) continue;
                    w.WriteStartArray(k);
                    foreach (var r in l)
                    {
                        if (r.Emp == k) continue;
                        w.WriteStartArray();
                        w.WriteStringValue(r.Emp); w.WriteStringValue(r.Qual); w.WriteStringValue(r.Data);
                        w.WriteStringValue(Nome(r.Emp)); w.WriteStringValue(Nat(r.Emp)); w.WriteNumberValue(ND(r.Emp));
                        w.WriteEndArray();
                    }
                    w.WriteEndArray();
                }
                w.WriteEndObject();
                w.WriteStartObject("c");
                foreach (var k in chaves)
                {
                    List<Rel> l;
                    if (!sobe.TryGetValue(k, out l)) continue;
                    w.WriteStartArray(k);
                    foreach (var r in l)
                    {
                        string s = SB(r.Soc);
                        if (s == k) continue;
                        w.WriteStartArray();
                        w.WriteStringValue(r.Soc); w.WriteStringValue(r.Qual); w.WriteStringValue(r.Data);
                        w.WriteStringValue(Nome(s)); w.WriteStringValue(EhExterior(s) ? "" : Nat(s)); w.WriteNumberValue(NS(s));
                        w.WriteEndArray();
                    }
                    w.WriteEndArray();
                }
                w.WriteEndObject();
                w.WriteEndObject();
            }
            bytes += new FileInfo(arq).Length;
        }
        Log(fatias.Count.ToString("N0") + " fatias de dados gravadas (" + (bytes / 1048576.0).ToString("N0") + " MB)");

        // busca por nome: cada empresa entra na fatia das 2 primeiras letras de cada palavra relevante do nome
        var busca = new Dictionary<string, List<string>>();
        foreach (var k in entidades)
        {
            var toks = Tokens(Nome(k));
            if (toks.Count == 0) continue;
            var uteis = toks.Where(t => !Stop.Contains(t)).ToList();
            if (uteis.Count == 0) uteis = toks.Take(1).ToList();
            foreach (var p in uteis.Select(t => t.Substring(0, 2)).Distinct()) Add(busca, p, k);
        }
        long bytesB = 0;
        foreach (var g in busca)
        {
            string arq = Path.Combine(saida, "b", g.Key + ".json.gz");
            using (var fs = File.Create(arq))
            using (var gz = new GZipStream(fs, CompressionLevel.Optimal))
            using (var w = new Utf8JsonWriter(gz, opcoes))
            {
                w.WriteStartArray();
                foreach (var k in g.Value.OrderByDescending(ND).ThenBy(x => x, StringComparer.Ordinal))
                {
                    w.WriteStartArray();
                    w.WriteStringValue(k); w.WriteStringValue(Nome(k)); w.WriteNumberValue(ND(k)); w.WriteNumberValue(NS(k));
                    w.WriteEndArray();
                }
                w.WriteEndArray();
            }
            bytesB += new FileInfo(arq).Length;
        }
        Log(busca.Count.ToString("N0") + " fatias de busca gravadas (" + (bytesB / 1048576.0).ToString("N0") + " MB)");

        int comNome = entidades.Count(k => Nome(k).Length > 0);
        using (var fs = File.Create(Path.Combine(saida, "meta.json")))
        using (var w = new Utf8JsonWriter(fs, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, Indented = true }))
        {
            w.WriteStartObject();
            w.WriteNumber("versao", 1);
            w.WriteString("formato", "json.gz");
            w.WriteString("mes", mes);
            w.WriteString("geradoEm", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
            w.WriteNumber("vinculos", rels.Count);
            w.WriteNumber("empresas", entidades.Count);
            w.WriteNumber("comNome", comNome);
            w.WriteStartArray("stop");
            foreach (var s in Stop.OrderBy(x => x, StringComparer.Ordinal)) w.WriteStringValue(s);
            w.WriteEndArray();
            w.WriteStartArray("arquivos");
            foreach (var a in socios.Concat(empresas)) w.WriteStringValue(Path.GetFileName(a));
            w.WriteEndArray();
            w.WriteEndObject();
        }
        string resumo = rels.Count.ToString("N0") + " vínculos, " + entidades.Count.ToString("N0") + " empresas (" + comNome.ToString("N0") + " com nome)";
        Log("Concluído: " + resumo);
        return resumo;
    }

    // ---------- leitura ----------
    static IEnumerable<string> Linhas(string arq)
    {
        bool zip;
        using (var fs = File.OpenRead(arq))
        {
            var b = new byte[4];
            zip = fs.Read(b, 0, 4) == 4 && b[0] == 0x50 && b[1] == 0x4b && b[2] == 3 && b[3] == 4;
        }
        if (zip)
        {
            using (var z = ZipFile.OpenRead(arq))
            {
                foreach (var e in z.Entries)
                {
                    if (e.FullName.EndsWith("/")) continue;
                    using (var s = e.Open())
                    using (var r = new StreamReader(s, Latin1, false, 1 << 16))
                    {
                        string l;
                        while ((l = r.ReadLine()) != null) yield return l;
                    }
                }
            }
        }
        else
        {
            using (var r = new StreamReader(arq, Latin1, false))
            {
                string l;
                while ((l = r.ReadLine()) != null) yield return l;
            }
        }
    }

    // CSV ";" com aspas (layout da Receita). Tolera aspas não escapadas dentro do texto.
    public static List<string> ParseLinha(string s)
    {
        var o = new List<string>(12);
        int n = s.Length, i = 0;
        while (i <= n)
        {
            if (i < n && s[i] == '"')
            {
                int j = i + 1, fim = -1;
                while (true)
                {
                    int k = s.IndexOf('"', j);
                    if (k < 0) break;
                    if (k + 1 >= n || s[k + 1] == ';') { fim = k; break; }
                    j = s[k + 1] == '"' ? k + 2 : k + 1;
                }
                if (fim < 0) { o.Add(s.Substring(i + 1)); break; }
                string v = s.Substring(i + 1, fim - i - 1);
                if (v.Contains("\"\"")) v = v.Replace("\"\"", "\"");
                o.Add(v);
                if (fim + 1 >= n) break;
                i = fim + 2;
            }
            else
            {
                int k = s.IndexOf(';', i);
                if (k < 0) k = n;
                o.Add(s.Substring(i, k - i));
                i = k + 1;
            }
        }
        return o;
    }

    public static string LimpaDoc(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (char ch in s)
        {
            char u = char.ToUpperInvariant(ch);
            if ((u >= '0' && u <= '9') || (u >= 'A' && u <= 'Z')) sb.Append(u);
        }
        return sb.ToString();
    }

    // CNPJ do sócio PJ: em geral 14 caracteres, mas há registros só com a raiz (ex.: estrangeiras) ou sem zeros à esquerda
    public static string ChaveSocioPJ(string doc)
    {
        doc = (doc ?? "").Trim();
        if (doc.Length == 0 || doc.Contains("*")) return "";
        string d = LimpaDoc(doc);
        if (d.Trim('0').Length == 0) return "";
        return d.Length > 8 ? d.PadLeft(14, '0') : d.PadLeft(8, '0');
    }

    public static string Normaliza(string s)
    {
        var d = (s ?? "").Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        bool espaco = false;
        foreach (char ch in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsWhiteSpace(ch)) { espaco = sb.Length > 0; continue; }
            if (espaco) { sb.Append(' '); espaco = false; }
            sb.Append(char.ToUpperInvariant(ch));
        }
        return sb.ToString();
    }

    // palavras para a busca: sem acento, só letras e números, 2+ caracteres
    public static List<string> Tokens(string s)
    {
        var n = Normaliza(s);
        var sb = new StringBuilder(n.Length);
        foreach (char ch in n) sb.Append((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') ? ch : ' ');
        return sb.ToString().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Where(t => t.Length >= 2).Distinct().ToList();
    }

    static bool EhExterior(string k) { return k.StartsWith("EX:", StringComparison.Ordinal); }
    static string SB(string k) { return EhExterior(k) ? k : k.Substring(0, 8); }
    static void Add<T>(Dictionary<string, List<T>> m, string k, T v)
    {
        List<T> l;
        if (!m.TryGetValue(k, out l)) { l = new List<T>(); m[k] = l; }
        l.Add(v);
    }
}
