// ==========================================================
// TERRACLIMATE — MAPAS DAS 14 VARIÁVEIS (NORMAL 1991-2020)
// + CSV COM AS MÉDIAS MENSAIS NORMAIS POR MUNICÍPIO
// ==========================================================


// ==========================================================
// 1. LIMITES — BRASIL (país), ESTADOS e MUNICÍPIOS
// ==========================================================
var brasilPais = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

var brasilEstados = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

var brasilGeom = brasilPais.geometry();

var municipios = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));


// ==========================================================
// 2. TERRACLIMATE
// ==========================================================
var terraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('1991-01-01', '2020-12-31');

var meses = ee.List.sequence(1, 12);


// ==========================================================
// 3. FATORES DE ESCALA OFICIAIS (tabela do catálogo GEE)
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

// Ranges de visualização (unidade física), ajustados para contraste no Brasil
// — mais estreitos que os extremos globais do dataset (ex.: tmmn/tmmx globais
// vão de -77 a 57.6 °C, incluindo Antártida/deserto; aqui uso faixas realistas
// pro território brasileiro). Ajuste à vontade.
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
// 4. NORMAL CLIMATOLÓGICA (30 anos) — média anual de cada variável
//    (usada tanto pros mapas quanto disponível pro CSV se quiser)
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
// 5. MAPAS — uma camada por variável
// ==========================================================
Map.centerObject(brasilGeom, 4);

VARIAVEIS.forEach(function (v) {
  Map.addLayer(
    normaisAnuais[v],
    { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
    v.toUpperCase() + ' — normal 1991-2020 (' + UNIDADES[v] + ')',
    false   // desmarcado por padrão — ative uma de cada vez pra não sobrepor tudo
  );
});

Map.addLayer(
  brasilEstados.style({ color: 'ffffff', fillColor: '00000000', width: 1 }),
  {}, 'Limites — Estados'
);
Map.addLayer(
  brasilPais.style({ color: '000000', fillColor: '00000000', width: 2 }),
  {}, 'Limite — Brasil'
);


// ==========================================================
// 6. CLIMATOLOGIA MENSAL (12 meses) DE CADA VARIÁVEL — para o CSV de médias
// ==========================================================
function climMensal(banda, escala) {
  return ee.ImageCollection.fromImages(
    meses.map(function (mes) {
      var nomeBanda = ee.String(banda).cat('_m').cat(ee.Number(mes).format('%02d'));
      return terraclimate
        .filter(ee.Filter.calendarRange(mes, mes, 'month'))
        .select(banda)
        .mean()
        .multiply(escala)
        .toFloat()                                  // evita erro de tipo homogêneo
        .rename(nomeBanda)
        .set('month', mes);
    })
  );
}
// Empilha as 12 imagens mensais de cada variável num único stack (168 bandas: 14 var x 12 meses)
var stackMedias = null;
VARIAVEIS.forEach(function (v) {
  var colecaoMensal = climMensal(v, ESCALAS[v]);
  var bandasMensais = colecaoMensal.toBands();   // vira 1 imagem com 12 bandas nomeadas '0_pr_m01' etc.
  // toBands() prefixa com o índice da coleção — renomeamos para ficar limpo: 'pr_m01'...'pr_m12'
  var nomesOriginais = bandasMensais.bandNames();
  var nomesLimpos = ee.List.sequence(1, 12).map(function (m) {
    return ee.String(v).cat('_m').cat(ee.Number(m).format('%02d'));
  });
  bandasMensais = bandasMensais.rename(nomesLimpos);
  stackMedias = (stackMedias === null) ? bandasMensais : stackMedias.addBands(bandasMensais);
});
stackMedias = stackMedias.clip(brasilGeom);


// ==========================================================
// 7. CENTROIDES + AMOSTRAGEM (168 bandas de uma vez)
// ==========================================================
var centroides = municipios.map(function (feat) {
  var centroide = feat.geometry().centroid(100);
  return ee.Feature(centroide).copyProperties(feat);
});

var amostrasMedias = stackMedias.sampleRegions({
  collection: centroides,
  scale: 5000,
  geometries: true
});


// ==========================================================
// 8. TABELA FINAL — médias mensais normais (1 linha por município)
// ==========================================================
var tabelaMedias = amostrasMedias.map(function (feat) {
  var geom = feat.geometry();
  var lon = geom.coordinates().get(0);
  var lat = geom.coordinates().get(1);

  var propsClimaticas = feat.toDictionary();   // todas as 168 colunas var_mXX já vêm daqui

  var propsIdentificacao = ee.Dictionary({
    latitude: lat,
    longitude: lon,
    municipio: feat.get('ADM2_NAME'),
    municipio_codigo_gaul: feat.get('ADM2_CODE'),
    UF: feat.get('ADM1_NAME'),
    UF_codigo_gaul: feat.get('ADM1_CODE')
  });

  return ee.Feature(null, propsIdentificacao.combine(propsClimaticas));
});

print('Tabela de médias (10 primeiras linhas):', tabelaMedias.limit(10));


// ==========================================================
// 9. EXPORTAR CSV — médias mensais normais
// ==========================================================
Export.table.toDrive({
  collection: tabelaMedias,
  description: 'terraclimate_medias_mensais_normais_brasil',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
