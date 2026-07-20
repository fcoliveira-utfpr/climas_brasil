// ==========================================================
// TERRACLIMATE — MAPAS DAS 14 VARIÁVEIS (NORMAL 1991-2020)
// ANUAIS + MENSAIS, VISUALIZAÇÃO DOS CENTROIDES (ASSET PRÓPRIO)
// + CSV COMPLETO COM AS MÉDIAS MENSAIS NORMAIS POR MUNICÍPIO
// ==========================================================


// ==========================================================
// 1. LIMITES — BRASIL (país) e ESTADOS (apenas para desenho no mapa)
// ==========================================================
var brasilPais = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

var brasilEstados = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

var brasilGeom = brasilPais.geometry();


// ==========================================================
// 2. CENTROIDES MUNICIPAIS — asset próprio (código IBGE)
//    A geometria já veio corretamente como Point na importação do CSV
//    (o GEE reconheceu as colunas latitude/longitude automaticamente).
//    Aqui apenas recriamos latitude/longitude como propriedades, a
//    partir da geometria, para que apareçam de volta na tabela final.
// ==========================================================
var centroidesIBGE = ee.FeatureCollection('projects/fcoliveira/assets/centroide_br')
  .map(function (feat) {
    var coords = feat.geometry().coordinates();
    return feat.set({
      longitude: coords.get(0),
      latitude: coords.get(1)
    });
  });

print('Exemplo de feature (geometria + propriedades):', centroidesIBGE.first());
print('Total de municípios no asset:', centroidesIBGE.size());


// ==========================================================
// 3. TERRACLIMATE
// ==========================================================
var terraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('1991-01-01', '2020-12-31');

var NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];


// ==========================================================
// 4. FATORES DE ESCALA OFICIAIS (tabela do catálogo GEE)
//    'pr'/'ro'/'swe' aparecem como "Scale: 0" no catálogo — isso significa
//    "sem fator de escala" (multiplicador = 1), não multiplicar por zero.
// ==========================================================
var ESCALAS = {
  aet: 0.1, def: 0.1, pdsi: 0.01, pet: 0.1, pr: 1, ro: 1,
  soil: 0.1, srad: 0.1, swe: 1, tmmn: 0.1, tmmx: 0.1,
  vap: 0.001, vpd: 0.01, vs: 0.01
};

var VARIAVEIS = Object.keys(ESCALAS);

var UNIDADES = {
  aet: 'mm', def: 'mm', pdsi: '', pet: 'mm', pr: 'mm', ro: 'mm',
  soil: 'mm', srad: 'W/m2', swe: 'mm', tmmn: 'C', tmmx: 'C',
  vap: 'kPa', vpd: 'kPa', vs: 'm/s'
};

// Ranges de visualização (unidade física), ajustados para contraste no Brasil.
var VIS_RANGES = {
  aet: [0, 150], def: [0, 200], pdsi: [-6, 6], pet: [50, 200],
  pr: [0, 400], ro: [0, 200], soil: [0, 400], srad: [150, 250],
  swe: [0, 5], tmmn: [5, 25], tmmx: [20, 35], vap: [0.5, 3],
  vpd: [0, 2], vs: [1, 5]
};

var PALETAS = {
  aet: ['ffffcc', 'a1dab4', '41b6c4', '225ea8'],
  def: ['fee5d9', 'fcae91', 'fb6a4a', 'cb181d'],
  pdsi: ['a50026', 'ffffbf', '313695'],
  pet: ['ffffb2', 'fecc5c', 'fd8d3c', 'e31a1c'],
  pr: ['f7fbff', '6baed6', '2171b5', '08306b'],
  ro: ['f7fcf5', 'a1d99b', '31a354', '00441b'],
  soil: ['f6e8c3', 'dfc27d', '80cdc1', '01665e'],
  srad: ['fff7bc', 'fec44f', 'd95f0e', '993404'],
  swe: ['ffffff', 'c6dbef', '6baed6', '084594'],
  tmmn: ['313695', '74add1', 'fee090', 'f46d43'],
  tmmx: ['fee090', 'f46d43', 'd73027', 'a50026'],
  vap: ['ffffcc', 'a1dab4', '41b6c4', '225ea8'],
  vpd: ['f7fcf0', 'ccebc5', '7bccc4', '2b8cbe'],
  vs: ['edf8fb', 'b2e2e2', '66c2a4', '238b45']
};


// ==========================================================
// 5. NORMAL CLIMATOLÓGICA ANUAL (30 anos) — média anual de cada variável
// ==========================================================
var normaisAnuais = {};
VARIAVEIS.forEach(function (v) {
  normaisAnuais[v] = terraclimate.select(v).mean()
    .multiply(ESCALAS[v])
    .toFloat()
    .clip(brasilGeom)
    .rename(v + '_normal_anual');
});


// ==========================================================
// 6. MAPAS ANUAIS — uma camada por variável (14 no total)
// ==========================================================
Map.centerObject(brasilGeom, 4);

VARIAVEIS.forEach(function (v) {
  Map.addLayer(
    normaisAnuais[v],
    { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
    v.toUpperCase() + ' — ANUAL (' + UNIDADES[v] + ')',
    false   // desmarcado por padrão
  );
});


// ==========================================================
// 7. MAPAS MENSAIS — uma camada por variável x mês (14 x 12 = 168 no total)
//    Todas desmarcadas por padrão; ative uma de cada vez pra não sobrepor tudo.
// ==========================================================
VARIAVEIS.forEach(function (v) {
  for (var m = 1; m <= 12; m++) {
    var mesStr = (m < 10 ? '0' : '') + m;
    var imgMes = terraclimate
      .filter(ee.Filter.calendarRange(m, m, 'month'))
      .select(v)
      .mean()
      .multiply(ESCALAS[v])
      .toFloat()
      .clip(brasilGeom)
      .rename(v + '_m' + mesStr);

    Map.addLayer(
      imgMes,
      { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
      v.toUpperCase() + ' — ' + NOMES_MESES[m - 1] + ' (' + UNIDADES[v] + ')',
      false
    );
  }
});


// ==========================================================
// 8. LIMITES E CENTROIDES NO MAPA
// ==========================================================
Map.addLayer(
  brasilEstados.style({ color: 'ffffff', fillColor: '00000000', width: 1 }),
  {}, 'Limites — Estados'
);
Map.addLayer(
  brasilPais.style({ color: '000000', fillColor: '00000000', width: 2 }),
  {}, 'Limite — Brasil'
);
Map.addLayer(
  centroidesIBGE.style({ color: 'ff0000', pointSize: 2 }),
  {}, 'Centroides municipais (asset IBGE)'
);


// ==========================================================
// 9. CLIMATOLOGIA MENSAL (12 meses) DE CADA VARIÁVEL — para o CSV
// ==========================================================
var meses = ee.List.sequence(1, 12);

function climMensal(banda, escala) {
  return ee.ImageCollection.fromImages(
    meses.map(function (mes) {
      var nomeBanda = ee.String(banda).cat('_m').cat(ee.Number(mes).format('%02d'));
      return terraclimate
        .filter(ee.Filter.calendarRange(mes, mes, 'month'))
        .select(banda)
        .mean()
        .multiply(escala)
        .toFloat()
        .rename(nomeBanda)
        .set('month', mes);
    })
  );
}

// Empilha as 12 imagens mensais de cada variável num único stack (168 bandas)
var stackMedias = null;
VARIAVEIS.forEach(function (v) {
  var colecaoMensal = climMensal(v, ESCALAS[v]);
  var bandasMensais = colecaoMensal.toBands();
  var nomesLimpos = ee.List.sequence(1, 12).map(function (m) {
    return ee.String(v).cat('_m').cat(ee.Number(m).format('%02d'));
  });
  bandasMensais = bandasMensais.rename(nomesLimpos);
  stackMedias = (stackMedias === null) ? bandasMensais : stackMedias.addBands(bandasMensais);
});
stackMedias = stackMedias.clip(brasilGeom);


// ==========================================================
// 10. AMOSTRAGEM NOS CENTROIDES DO ASSET (168 bandas de uma vez)
//     sampleRegions preserva automaticamente todas as propriedades
//     originais do asset (codigo_ibge, nome_municipio, uf_sigla,
//     regiao_nome, latitude, longitude, etc.) e adiciona as 168
//     colunas climáticas.
// ==========================================================
var amostrasMedias = stackMedias.sampleRegions({
  collection: centroidesIBGE,
  scale: 5000,
  geometries: true
});

print('Tabela final (10 primeiras linhas):', amostrasMedias.limit(10));
print('Total de linhas na tabela final:', amostrasMedias.size());


// ==========================================================
// 11. EXPORTAR CSV — tabela completa (identificação + 168 colunas climáticas)
// ==========================================================
Export.table.toDrive({
  collection: amostrasMedias,
  description: 'terraclimate_medias_mensais_normais_municipios_ibge',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
