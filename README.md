# 🌦️ climas_brasil

**O clima do Brasil, município por município, em três sabores diferentes.**

Este repositório reúne os dados, códigos e a plataforma web desenvolvidos para o artigo científico:

> **Classificação climática de Köppen-Geiger, Thornthwaite e Camargo para o Brasil: uma abordagem por unidades político-administrativas**

Se você chegou até aqui, ou é revisor de periódico verificando reprodutibilidade, ou está tentando descobrir se a sua cidade é mais "tropical úmido" ou "só quente mesmo". As duas motivações são bem-vindas.

---

## 🗺️ Veja no mapa antes de ler o código

Antes de mergulhar nos notebooks, dá uma olhada na plataforma interativa **ClimaTec Data**, construída especialmente para explorar estes resultados sem precisar abrir uma linha de Python:

🔗 `[URL do GitHub Pages a confirmar]`

- Escolha um estado e um município
- Veja a classe climática segundo Köppen-Geiger, Camargo e Thornthwaite
- Explore o climograma / balanço hídrico mensal de cada município (normais 1991–2020, TerraClimate)

Toda a aplicação roda no navegador — sem servidor, sem backend, só HTML/JS e uma dose generosa de `fetch()`.

---

## 🎯 Do que se trata

5.570 municípios brasileiros. Três sistemas clássicos de classificação climática, calculados de forma consistente e comparável a partir de uma única fonte de dados (TerraClimate, normais 1991–2020):

| Classificação | O que considera | Classes no Brasil |
|---|---|---|
| 🌧️ **Köppen-Geiger** | Precipitação e temperatura | 12 (Af, Am, As, Aw, BSh, BWh, Cfa, Cfb, Csa, Csb, Cwa, Cwb) |
| ☀️ **Camargo** | Regime térmico × regime hídrico | 26 combinações |
| 💧 **Thornthwaite** | Balanço hídrico climatológico | 9 (de árido a super-úmido) |

A escolha da unidade político-administrativa (município) como recorte espacial — em vez de grades regulares ou estações isoladas — foi o que motivou o artigo: torna os resultados diretamente utilizáveis por gestores públicos, extensionistas rurais e planejadores agrícolas, sem exigir conhecimento prévio de geoprocessamento.

---

## 📦 Estrutura do repositório

```
climas_brasil/
│
├── 📓 Notebooks de processamento
│   ├── climas_brasil_koppen.ipynb          # cálculo da classificação Köppen-Geiger
│   ├── climas_brasil_camargo.ipynb         # cálculo da classificação Camargo
│   ├── climas_brasil_thornthwaite.ipynb    # cálculo da classificação Thornthwaite
│   ├── climas_brasil_mapas.ipynb           # geração dos mapas estáticos
│   ├── climas_brasil_series_caracterizacao_UF.ipynb
│   ├── municipios_brasil_ibge.ipynb        # obtenção da malha e códigos IBGE
│   ├── estatisticas_descritivas_climas_brasil.ipynb
│   └── codigo_correcao_*.ipynb             # rotinas de preenchimento de municípios sem dado direto
│
├── ⚙️ Scripts Google Earth Engine
│   ├── Koppen_91_20.js
│   ├── Camargo_91_20.js
│   ├── Thornthwaite_91_20.js
│   ├── covariaveis_TC_normal_91_20.js
│   └── covariaveis_TC_mensal_91_20.js
│
├── 📊 Dados por classificação (um município por linha)
│   ├── koppen_municipios_preenchido.csv
│   ├── camargo_municipios_preenchido.csv
│   ├── thornthwaite_municipios_preenchido.csv
│   └── *_municipios_brasil_completo.csv    # versão sem preenchimento de vizinhos
│
├── 📅 Normais e séries mensais TerraClimate
│   ├── terraclimate_medias_mensais_normais_municipios_ibge.csv   # normal 1991–2020, Brasil inteiro
│   ├── terraclimate_medias_mensais_normais_brasil.csv
│   └── terraclimate_serie_mensal_YYYY_municipios_ibge.csv        # 1991 a 2020, um arquivo por ano
│
├── 🚀 mensal_uf/
│   └── {UF}.json           # normais mensais recortadas por estado, para uso leve no ClimaTec Data
│
└── 🌐 ClimaTec Data (aplicação web)
    ├── index.html           # página inicial
    ├── koppen.html
    ├── camargo.html
    └── thornthwaite.html
```

---

## 🧮 Como os dados foram gerados, em três frases

1. As normais climatológicas mensais (1991–2020) foram extraídas do TerraClimate via Google Earth Engine, agregadas por município a partir da malha oficial do IBGE.
2. Cada sistema de classificação (Köppen-Geiger, Camargo, Thornthwaite) foi calculado programaticamente a partir dessas normais, com rotinas específicas de preenchimento para municípios sem cobertura direta (interpolação a partir de vizinhos, sinalizada na coluna `preenchido_por_vizinho`).
3. Os resultados foram consolidados em tabelas municipais e, para a aplicação web, reempacotados em JSONs leves por estado — porque ninguém merece esperar o carregamento de um CSV de 9 MB para ver o clima de um município só.

Detalhes completos de equações, limiares e fontes estão descritos na seção de Material e Métodos do artigo.

---

## 📖 Como citar

Se este repositório ou os dados forem úteis para o seu trabalho, por favor cite o artigo original:

```
[SOBRENOME, Nome et al. Classificação climática de Köppen-Geiger, Thornthwaite e Camargo
para o Brasil: uma abordagem por unidades político-administrativas. Periódico, v. X, n. X,
ano. DOI: [inserir]]
```

*(referência completa a ser atualizada após publicação)*

---

## 🙏 Agradecimentos

CAPES · Fundação Araucária · UTFPR — Campus Santa Helena

---

## 📬 Contato

Fabrício Correia de Oliveira — UTFPR, Campus Santa Helena
`fcoliveira@utfpr.edu.br`

---

*Feito com Python, JavaScript, café e uma quantidade não-trivial de sistemas de coordenadas que teimavam em não bater.*
