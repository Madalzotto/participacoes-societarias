# Participações Societárias

Mostra **de quais empresas um CNPJ é sócio** (e quem está acima dele), usando o Quadro de Sócios e
Administradores publicado pela Receita Federal nos Dados Abertos do CNPJ.

Os sites de consulta mostram os sócios de uma empresa. Este projeto faz o caminho inverso: dada a
empresa X, lista as empresas Y em que X aparece como sócia, em vários níveis.

## Como funciona

1. Todo dia o workflow **Atualizar base da Receita** (GitHub Actions) confere se a Receita publicou
   um mês novo em [arquivos.receitafederal.gov.br](https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9).
2. Quando há mês novo, ele baixa `Socios0-9.zip` e `Empresas0-9.zip` (~2 GB) e roda
   `scripts/atualizar.ps1`. Esse script guarda só os vínculos em que o sócio é pessoa jurídica,
   sem CPFs.
3. O resultado é uma API estática publicada no GitHub Pages (branch `gh-pages`), junto com a página
   (`index.html`, `app.js`, `tema.js`, `estilo.css`), que faz as consultas. O tema claro/escuro segue o
   sistema, e a escolha feita no botão fica salva no navegador.

Para forçar uma atualização: aba **Actions** → *Atualizar base da Receita* → **Run workflow**
(marque "Reprocessar mesmo sem mês novo").

## API

Arquivos em `api/`, compactados em gzip (`.json.gz`, descompacte ao ler):

| Arquivo | Conteúdo |
|---|---|
| `meta.json` | mês da Receita, data de geração, contagens |
| `s/<3 primeiros caracteres da raiz do CNPJ>.json.gz` | `n`: nome e natureza jurídica · `p`: empresas em que a raiz é sócia · `c`: sócias PJ da raiz |
| `s/ex.json.gz` | sócias estrangeiras sem CNPJ (chave `EX:NOME`) |
| `b/<2 primeiras letras de uma palavra do nome>.json.gz` | busca por nome: `[chave, nome, nº de participações, nº de sócias PJ]` |

Itens de `p` e `c`: `[CNPJ ou raiz, qualificação, data de entrada (AAAAMMDD), nome, natureza jurídica, nº de ligações seguintes]`.

## Limitações dos dados da Receita

- Não informam o percentual de participação.
- Em Sociedades Anônimas o QSA lista diretores e conselheiros, não acionistas.
- A base é mensal: participações mais recentes só aparecem na publicação seguinte.

## Segurança

- A página só carrega script e estilo do próprio site (Content-Security-Policy) e só se conecta à API deste
  repositório, à BrasilAPI e à Minha Receita. Os dados recebidos são validados e escapados antes de aparecer na tela.
- O CSV exportado neutraliza textos que o Excel interpretaria como fórmula.
- Os workflows rodam com permissões mínimas e usam ações fixadas por commit (atualizadas pelo Dependabot).

## Gerar a base no próprio computador

Requer PowerShell 7 (`pwsh`):

```powershell
./scripts/atualizar.ps1 -Etapa processar          # baixa o mês mais recente e gera site/
```
