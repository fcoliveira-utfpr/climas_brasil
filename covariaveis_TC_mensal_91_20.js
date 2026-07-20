// ==========================================================
// TERRACLIMATE — SÉRIE MENSAL BRUTA 1991-2020 POR MUNICÍPIO
// Formato longo: 1 linha por (município x ano x mês)
// EXPORTAÇÃO EM BLOCOS ANUAIS (1 task por ano) — evita estourar
// memória, já que ~5.570 municípios x 360 meses = ~2 milhões de
// linhas não cabem numa única computação.
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
// ==========================================================
var centroidesIBGE = ee.FeatureCollection('projects/fcoliveira/assets/centroide_br')
  .map(function (feat) {
    var coords = feat.geometry().coordinates();
    return feat.set({
      longitude: coords.get(0),
      latitude: coords.get(1)
    });
  });

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
  for (var mCtx = 1; mCtx <= 12; mCtx++) {
    var mesStrCtx = (mCtx < 10 ? '0' : '') + mCtx;
    var imgMesNormal = terraclimate
      .filter(ee.Filter.calendarRange(mCtx, mCtx, 'month'))
      .select(v)
      .mean()
      .multiply(ESCALAS[v])
      .toFloat()
      .clip(brasilGeom)
      .rename(v + '_m' + mesStrCtx);

    Map.addLayer(
      imgMesNormal,
      { min: VIS_RANGES[v][0], max: VIS_RANGES[v][1], palette: PALETAS[v] },
      v.toUpperCase() + ' — ' + NOMES_MESES[mCtx - 1] + ' (' + UNIDADES[v] + ')',
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
// 6. FUNÇÃO — amostra um único (ano, mês) nos centroides
//    Recebe números JS simples (não ee.Number), pois agora quem
//    itera é um for do lado do cliente, não um ee.List.map.
// ==========================================================
function amostrarAnoMes(ano, mes) {
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


// ==========================================================
// 7. TESTE RÁPIDO (interativo, seguro) — 1 único mês, 5 linhas
//    NUNCA faça print() da série completa; só de um recorte pequeno
//    como este, pra conferir se as colunas/valores estão corretos.
// ==========================================================
var testeUmMes = amostrarAnoMes(2020, 1);
print('Teste — Jan/2020, 5 primeiras linhas:', testeUmMes.limit(5));


// ==========================================================
// 8. EXPORTAÇÃO EM BLOCOS ANUAIS (1 task por ano, 30 tasks no total)
//    Cada task ~5.570 municípios x 12 meses ≈ 66.840 linhas — leve
//    o suficiente para não estourar memória nem timeout do batch.
//    Depois de rodar o script, vá na aba "Tasks" e clique "RUN" em
//    cada uma das 30 tasks (elas não iniciam sozinhas).
// ==========================================================
for (var anoExport = 1991; anoExport <= 2020; anoExport++) {
  var colecaoAno = null;

  for (var mesExport = 1; mesExport <= 12; mesExport++) {
    var amostraMes = amostrarAnoMes(anoExport, mesExport);
    colecaoAno = (colecaoAno === null) ? amostraMes : colecaoAno.merge(amostraMes);
  }

  Export.table.toDrive({
    collection: colecaoAno,
    description: 'terraclimate_serie_mensal_' + anoExport + '_municipios_ibge',
    folder: 'GEE_exports',
    fileFormat: 'CSV'
  });
}
