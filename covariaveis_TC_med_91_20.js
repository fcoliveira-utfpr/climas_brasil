// ==========================================================
// TERRACLIMATE — SÉRIE MENSAL BRUTA 1991-2020 POR MUNICÍPIO
// Formato longo: 1 linha por (município x ano x mês)
// ATENÇÃO: ~5.570 municípios x 360 meses = ~2 milhões de linhas.
// Isso é pesado — leia os avisos depois do código antes de rodar pro Brasil inteiro.
// ==========================================================


// ==========================================================
// 1. MUNICÍPIOS DO BRASIL
// ==========================================================
var municipios = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

// Para testar/rodar em partes, filtre por estado (recomendado, veja aviso abaixo):
// municipios = municipios.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

var centroides = municipios.map(function (feat) {
  var centroide = feat.geometry().centroid(100);
  return ee.Feature(centroide).copyProperties(feat);
});


// ==========================================================
// 2. TERRACLIMATE
// ==========================================================
var terraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('1991-01-01', '2020-12-31');

var ESCALAS = {
  aet: 0.1, def: 0.1, pdsi: 0.01, pet: 0.1, pr: 1, ro: 1,
  soil: 0.1, srad: 0.1, swe: 1, tmmn: 0.1, tmmx: 0.1,
  vap: 0.001, vpd: 0.01, vs: 0.01
};
var VARIAVEIS = Object.keys(ESCALAS);


// ==========================================================
// 3. ANOS E MESES (30 x 12 = 360 combinações)
// ==========================================================
var anos = ee.List.sequence(1991, 2020);
var meses = ee.List.sequence(1, 12);

// lista de pares [ano, mes], 360 elementos
var paresAnoMes = anos.map(function (ano) {
  return meses.map(function (mes) {
    return ee.List([ano, mes]);
  });
}).flatten();

// converte a lista plana de volta em pares (flatten() achata tudo; reconstituímos)
var paresAnoMesCorrigido = ee.List.sequence(0, ee.Number(paresAnoMes.length()).divide(2).subtract(1)).map(function (i) {
  i = ee.Number(i).multiply(2);
  return ee.List([paresAnoMes.get(i), paresAnoMes.get(i.add(1))]);
});


// ==========================================================
// 4. PARA CADA (ANO, MÊS): monta a imagem com as 14 variáveis
//    escaladas, amostra nos centroides, marca ano/mês
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
    collection: centroides,
    scale: 5000,
    geometries: true
  });

  return amostras.map(function (feat) {
    var geom = feat.geometry();
    return ee.Feature(null, {
      ano: ano,
      mes: mes,
      latitude: geom.coordinates().get(1),
      longitude: geom.coordinates().get(0),
      municipio: feat.get('ADM2_NAME'),
      municipio_codigo_gaul: feat.get('ADM2_CODE'),
      UF: feat.get('ADM1_NAME'),
      UF_codigo_gaul: feat.get('ADM1_CODE'),
      aet: feat.get('aet'), def: feat.get('def'), pdsi: feat.get('pdsi'),
      pet: feat.get('pet'), pr: feat.get('pr'), ro: feat.get('ro'),
      soil: feat.get('soil'), srad: feat.get('srad'), swe: feat.get('swe'),
      tmmn: feat.get('tmmn'), tmmx: feat.get('tmmx'), vap: feat.get('vap'),
      vpd: feat.get('vpd'), vs: feat.get('vs')
    });
  });
}

var tabelaCompleta = ee.FeatureCollection(
  paresAnoMesCorrigido.map(amostrarAnoMes)
).flatten();


// ==========================================================
// 5. EXPORTAR CSV — série mensal bruta (30 anos)
// ==========================================================
Export.table.toDrive({
  collection: tabelaCompleta,
  description: 'terraclimate_serie_mensal_1991_2020_brasil',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
