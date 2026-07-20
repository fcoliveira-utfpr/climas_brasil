// ==========================================================
// TERRACLIMATE — SÉRIE MENSAL BRUTA 1991-2020 POR MUNICÍPIO
// Formato longo: 1 linha por (município x ano x mês)
// + MAPAS (normais anuais e mensais) + CENTROIDES DO ASSET IBGE
// ATENÇÃO: ~5.570 municípios x 360 meses = ~2 milhões de linhas.
// Isso é pesado — leia os avisos no final antes de rodar pro Brasil inteiro.
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
//    A geometria já vem como Point (reconhecida automaticamente no
//    upload do CSV). Recriamos latitude/longitude como propriedades
//    a partir da geometria, para elas aparecerem na tabela final.
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
// 4. FATORES DE ESCALA, UNIDADES, PALETAS E RANGES (para os mapas)
//    'pr'/'ro'/'swe' aparecem como "Scale: 0" no catálogo — significa
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
// 5. MAPAS DE CONTEXTO — normais anuais e mensais (1991-2020)
//    (não são a série bruta — servem só de referência visual antes
//    de rodar a extração pesada da série mensal)
// ==========================================================
var normaisAnuais = {};
VARIAVEIS.forEach(function (v) {
  normaisAnuais[v] = terraclimate.select(v).mean()
    .multiply(ESCALAS[v])
    .toFloat()
    .clip(brasilGeom)
    .rename(v + '_normal_anual');
});

Map.centerObject(brasilGeom, 4);

VARIAVEIS.forEach(function (v) {
  Map.addLayer(
    normaisAnuais[v],
    { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
    v.toUpperCase() + ' — ANUAL (' + UNIDADES[v] + ')',
    false
  );
});

VARIAVEIS.forEach(function (v) {
  for (var m = 1; m <= 12; m++) {
    var mesStr = (m < 10 ? '0' : '') + m;
    var imgMesNormal = terraclimate
      .filter(ee.Filter.calendarRange(m, m, 'month'))
      .select(v)
      .mean()
      .multiply(ESCALAS[v])
      .toFloat()
      .clip(brasilGeom)
      .rename(v + '_m' + mesStr);

    Map.addLayer(
      imgMesNormal,
      { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
      v.toUpperCase() + ' — ' + NOMES_MESES[m - 1] + ' (' + UNIDADES[v] + ')',
      false
    );
  }
});

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
// 6. ANOS E MESES DA SÉRIE BRUTA (30 x 12 = 360 combinações)
//    Gerado por aritmética de índice — mais simples e seguro do
//    que empilhar/desempilhar listas aninhadas com flatten().
// ==========================================================
var ANO_INICIO = 1991;
var TOTAL_MESES = 30 * 12; // 360

var paresAnoMes = ee.List.sequence(0, TOTAL_MESES - 1).map(function (i) {
  i = ee.Number(i);
  var ano = ee.Number(ANO_INICIO).add(i.divide(12).floor());
  var mes = i.mod(12).add(1);
  return ee.List([ano, mes]);
});


// ==========================================================
// 7. PARA CADA (ANO, MÊS): monta a imagem com as 14 variáveis
//    escaladas, amostra nos centroides do asset IBGE, marca ano/mês.
//    sampleRegions já preserva codigo_ibge, nome_municipio, uf_sigla,
//    regiao_nome, latitude, longitude etc. — não precisa reconstruir
//    a Feature manualmente.
// ==========================================================
function amostrarAnoMes(par) {
  par = ee.List(par);
  var ano = ee.Number(par.get(0));
  var mes = ee.Number(par.get(1));

  var dataIni = ee.Date.fromYMD(ano, mes, 1);
  var dataFim = dataIni.advance(1, 'month');

  var imgMes = terraclimate.filterDate(dataIni, dataFim).first();

  var bandasEscaladas = VARIAVEIS.map(function (v) {
    return imgMes.select(v).multiply(ESCALAS[v]).toFloat().rename(v);
  });

  var imgFinal = ee.Image.cat(bandasEscaladas);

  var amostras = imgFinal.sampleRegions({
    collection: centroidesIBGE,
    scale: 5000,
    geometries: true
  });

  return amostras.map(function (feat) {
    return feat.set({ ano: ano, mes: mes });
  });
}

var tabelaCompleta = ee.FeatureCollection(
  paresAnoMes.map(amostrarAnoMes)
).flatten();

print('Amostra da série bruta (10 primeiras linhas):', tabelaCompleta.limit(10));


// ==========================================================
// 8. EXPORTAR CSV — série mensal bruta (30 anos)
// ==========================================================
Export.table.toDrive({
  collection: tabelaCompleta,
  description: 'terraclimate_serie_mensal_1991_2020_municipios_ibge',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
