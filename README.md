# Éboli

Aplicação web simples para **gestão de antibioticoterapia por paciente**.

Cada paciente possui um **card** com um **setor antibiótico** dividido em duas áreas:

1. **Em uso** — antibióticos ativos do paciente.
2. **Histórico de antibióticos utilizados** — uma tabela com:
   - Data da prescrição
   - Nome do antibiótico
   - Sítio de infecção
   - Se a SCIH estava ciente
   - Tempo de uso

## Migração automática para o histórico

Ao clicar em **Finalizar** em um antibiótico em uso, ele é automaticamente
movido para o histórico dentro do próprio card. A data de término é registrada
no momento da finalização e o **tempo de uso** é calculado a partir da data de
início até a data de término (em dias, inclusivo).

## Como rodar

Não há etapa de build. Basta abrir o `index.html` em um navegador, ou servir a
pasta localmente:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

Os dados são salvos no `localStorage` do navegador.

## Deploy (Netlify)

O `netlify.toml` publica a raiz do projeto como site estático, sem build.
