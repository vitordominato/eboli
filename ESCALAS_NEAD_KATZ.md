# Escalas NEAD e Katz — brief de implementação

Referência para **portar as escalas para o app `eboli-premier` (Vite + Firebase)**, que é
o repositório que efetivamente publica em `eboli-premier.netlify.app`.

> Implementação de referência (vanilla JS) neste repositório `eboli`:
> `app.js`, `index.html`, `styles.css`. Reaproveite a **lógica**; adapte a
> persistência para o **Firestore** (por paciente) e use os componentes de UI
> já existentes no projeto premier.

## Objetivo
Em cada paciente, adicionar duas escalas com preenchimento simples (selects) e
**resultado/classificação automáticos e ao vivo**.

## Modelo de dados (por paciente)
```jsonc
katz | nead = {
  "data": "YYYY-MM-DD",
  "itens": { "<chave>": <pontuação>, ... },
  "total": <soma>
}
```
Integração: o item `katz` do NEAD é pré-preenchido a partir da avaliação Katz
(ver mapa no fim).

## Escala de Katz (0–6)
Cada item: **Independente = 1**, **Dependente = 0**.

| Chave | Item |
|---|---|
| `banho` | Banhar-se |
| `vestir` | Vestir-se |
| `banheiro` | Ir ao banheiro |
| `transferencia` | Transferência |
| `continencia` | Continência |
| `alimentacao` | Alimentação |

Classificação automática (total):
- **5–6** → Independente
- **3–4** → Dependência parcial
- **≤2** → Dependente total

## Escala NEAD (Grupo 3) — pontuação final = soma dos 10 itens

| Chave | Item | Opções (pontos) |
|---|---|---|
| `nutricional` | Estado nutricional | Eutrófico (0) · Sobrepeso/Emagrecido (1) · Obeso/Desnutrido (2) |
| `enteral` | Alimentação ou medicações por via enteral | Sem auxílio (0) · Assistida (1) · Gastrostomia/Jejunostomia (2) · Por SNG/SNE (3) |
| `katz` | Katz (se pediatria, pontuar 2) | Independente (0) · Dependente parcial (1) · Dependente total (2) |
| `internacoes` | Internações no último ano | 0–1 (0) · 2–3 (1) · >3 (2) |
| `aspiracoes` | Aspirações de vias aéreas superiores | Ausente (0) · Até 5x/dia (1) · Mais de 5x/dia (2) |
| `lesoes` | Lesões | Nenhuma/lesão única curativo simples (0) · Múltiplas c/ curativos simples ou única c/ curativo complexo (1) · Múltiplas c/ curativos complexos (2) |
| `medicacoes` | Medicações | Via enteral (0) · IM ou SC (1) · IV até 4x/dia / Hipodermóclise (2) |
| `exercicios` | Exercícios ventilatórios | Ausente (0) · Intermitente (1) |
| `oxigenio` | Uso de oxigenioterapia | Ausente (0) · Intermitente (1) · Contínuo (2) |
| `consciencia` | Nível de consciência | Alerta (0) · Confuso/Desorientado (1) · Comatoso (2) |

Classificação automática (pontuação final):
- **≤5** → Considerar procedimentos pontuais exclusivos ou outros programas
- **6–11** → Atendimento Domiciliar Multiprofissional
- **12–17** → Internação Domiciliar 12h
- **≥18** → Internação Domiciliar 24h

## Mapa Katz → item `katz` do NEAD
- Independente (Katz 5–6) → **0**
- Dependência parcial (Katz 3–4) → **1**
- Dependente total (Katz ≤2) → **2**

## Funções de classificação (referência)
```js
function katzClass(total) {
  if (total >= 5) return "Independente";
  if (total >= 3) return "Dependência parcial";
  return "Dependente total";
}

function neadClass(total) {
  if (total <= 5)  return "Procedimentos pontuais exclusivos ou outros programas";
  if (total <= 11) return "Atendimento Domiciliar Multiprofissional";
  if (total <= 17) return "Internação Domiciliar 12h";
  return "Internação Domiciliar 24h";
}

function katzParaNead(katz) {
  if (!katz) return null;
  if (katz.total >= 5) return 0;
  if (katz.total >= 3) return 1;
  return 2;
}
```
