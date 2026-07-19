// ==========================================================
// CLASSIFICAÇÃO DE KÖPPEN-GEIGER — BRASIL
// Base: TerraClimate (1991-2020)
// Metodologia: Alvares et al. (2013) — Af/Am/As/Aw, BWh/BWk/BSh/BSk,
// Cfa/Cfb/Cfc, Csa/Csb/Csc, Cwa/Cwb/Cwc, D completo, ET/EF
// Classificação no CENTROIDE dos municípios + raster clipado ao Brasil
// Exporta CSV (com variáveis climáticas + código numérico + códigos GAUL)
// Camadas de limite (país e estados)
// ==========================================================


// ==========================================================
// 1. LIMITES — BRASIL (país) e ESTADOS
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


// ==========================================================
// 3. TEMPERATURA MÉDIA MENSAL
// ==========================================================
function calcularTmedia(img) {
  var tmed = img.select('tmmx')
    .add(img.select('tmmn'))
    .divide(2)
    .multiply(0.1)
    .rename('tmed');
  return tmed.copyProperties(img, ['system:time_start']);
}

var tmedCollection = terraclimate.map(calcularTmedia);


// ==========================================================
// 4. CLIMATOLOGIA MENSAL
// ==========================================================
var meses = ee.List.sequence(1, 12);

var climPrecip = ee.ImageCollection.fromImages(
  meses.map(function (mes) {
    return terraclimate
      .filter(ee.Filter.calendarRange(mes, mes, 'month'))
      .select('pr')
      .mean()
      .rename('pr')
      .set('month', mes);
  })
);

var climTmed = ee.ImageCollection.fromImages(
  meses.map(function (mes) {
    return tmedCollection
      .filter(ee.Filter.calendarRange(mes, mes, 'month'))
      .mean()
      .rename('tmed')
      .set('month', mes);
  })
);


// ==========================================================
// 5. VARIÁVEIS CLIMÁTICAS ANUAIS (já clipadas ao Brasil)
// ==========================================================
var tempAnual = climTmed.mean().clip(brasilGeom).rename('temp_anual');
var tempMesMaisFrio = climTmed.reduce(ee.Reducer.min()).clip(brasilGeom).rename('tcold');
var tempMesMaisQuente = climTmed.reduce(ee.Reducer.max()).clip(brasilGeom).rename('thot');

var tmon10 = ee.ImageCollection(
  climTmed.toList(12).map(function (img) {
    return ee.Image(img).gt(10);
  })
).sum().clip(brasilGeom).rename('tmon10');

var precAnual = climPrecip.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('rann');
var mesMaisSeco = climPrecip.reduce(ee.Reducer.min()).clip(brasilGeom).rename('rdry');


// ==========================================================
// 6. SAZONALIDADE — verão = out-mar, inverno = abr-set (ONDJFM/AMJJAS)
// ==========================================================
var MESES_VERAO = [10, 11, 12, 1, 2, 3];
var MESES_INVERNO = [4, 5, 6, 7, 8, 9];

var climPrecipVerao = climPrecip.filter(ee.Filter.inList('month', MESES_VERAO));
var climPrecipInverno = climPrecip.filter(ee.Filter.inList('month', MESES_INVERNO));

var precVeraoSum = climPrecipVerao.reduce(ee.Reducer.sum()).rename('psum_verao');
var precInvernoSum = climPrecipInverno.reduce(ee.Reducer.sum()).rename('psum_inverno');

var psdry = climPrecipVerao.reduce(ee.Reducer.min()).rename('psdry');
var pwdry = climPrecipInverno.reduce(ee.Reducer.min()).rename('pwdry');
var pswet = climPrecipVerao.reduce(ee.Reducer.max()).rename('pswet');
var pwwet = climPrecipInverno.reduce(ee.Reducer.max()).rename('pwwet');


// ==========================================================
// 7. LIMIAR DE ARIDEZ (ZONA B) — regra dos 70%
// ==========================================================
var pctVerao = precVeraoSum.divide(precAnual);
var pctInverno = precInvernoSum.divide(precAnual);

var pThreshold = tempAnual.multiply(2).add(14);
pThreshold = pThreshold.where(pctInverno.gte(0.7), tempAnual.multiply(2));
pThreshold = pThreshold.where(pctVerao.gte(0.7), tempAnual.multiply(2).add(28));


// ==========================================================
// 8. GRUPOS CLIMÁTICOS
// ==========================================================
var grupoA = tempMesMaisFrio.gte(18);
var grupoC = tempMesMaisQuente.gt(10).and(tempMesMaisFrio.gt(-3)).and(tempMesMaisFrio.lt(18));
var grupoD = tempMesMaisQuente.gt(10).and(tempMesMaisFrio.lte(-3));
var grupoE = tempMesMaisQuente.lte(10);
var grupoB = precAnual.lt(pThreshold.multiply(10));


// ==========================================================
// 9. SUBTIPOS TROPICAIS (A)
// ==========================================================
var amThr = ee.Image(100).subtract(precAnual.divide(25));

var Af = grupoA.and(mesMaisSeco.gte(60));
var Am = grupoA.and(mesMaisSeco.lt(60)).and(mesMaisSeco.gte(amThr));
var Aseca = grupoA.and(mesMaisSeco.lt(60)).and(mesMaisSeco.lt(amThr));
var As = Aseca.and(psdry.lt(pwdry));
var Aw = Aseca.and(psdry.gte(pwdry));


// ==========================================================
// 10. SUBTIPOS SECOS (B)
// ==========================================================
var isBW = grupoB.and(precAnual.lt(pThreshold.multiply(5)));
var isBS = grupoB.and(precAnual.gte(pThreshold.multiply(5)));

var BWh = isBW.and(tempAnual.gte(18));
var BWk = isBW.and(tempAnual.lt(18));
var BSh = isBS.and(tempAnual.gte(18));
var BSk = isBS.and(tempAnual.lt(18));


// ==========================================================
// 11. SUBTIPOS TEMPERADOS/CONTINENTAIS (C/D)
// ==========================================================
var isF = mesMaisSeco.gte(40);
var isW = mesMaisSeco.lt(40).and(pswet.gte(pwdry.multiply(10)));
var isS = mesMaisSeco.lt(40).and(pwwet.gte(psdry.multiply(3))).and(isW.not());

var isQuente = tempMesMaisQuente.gte(22);
var isTemperado = isQuente.not().and(tmon10.gte(4));
var isCurto = isQuente.not().and(isTemperado.not()).and(tmon10.gte(1)).and(tmon10.lt(4));
var isMuitoFrio = tempMesMaisFrio.lt(-38);

var Cfa = grupoC.and(isF).and(isQuente);
var Cfb = grupoC.and(isF).and(isTemperado);
var Cfc = grupoC.and(isF).and(isCurto);
var Csa = grupoC.and(isS).and(isQuente);
var Csb = grupoC.and(isS).and(isTemperado);
var Csc = grupoC.and(isS).and(isCurto);
var Cwa = grupoC.and(isW).and(isQuente);
var Cwb = grupoC.and(isW).and(isTemperado);
var Cwc = grupoC.and(isW).and(isCurto);

var Dfa = grupoD.and(isF).and(isQuente);
var Dfb = grupoD.and(isF).and(isTemperado);
var Dfc = grupoD.and(isF).and(isCurto);
var Dfd = grupoD.and(isF).and(isMuitoFrio);
var Dsa = grupoD.and(isS).and(isQuente);
var Dsb = grupoD.and(isS).and(isTemperado);
var Dsc = grupoD.and(isS).and(isCurto);
var Dsd = grupoD.and(isS).and(isMuitoFrio);
var Dwa = grupoD.and(isW).and(isQuente);
var Dwb = grupoD.and(isW).and(isTemperado);
var Dwc = grupoD.and(isW).and(isCurto);
var Dwd = grupoD.and(isW).and(isMuitoFrio);


// ==========================================================
// 12. SUBTIPOS POLARES (E)
// ==========================================================
var ET = grupoE.and(tempMesMaisQuente.gt(0));
var EF = grupoE.and(tempMesMaisQuente.lte(0));


// ==========================================================
// 13. MAPA FINAL (clipado ao Brasil)
// ==========================================================
var klass = ee.Image(0).rename('koppen')
  .where(Af, 1).where(Am, 2).where(As, 3).where(Aw, 4)
  .where(Cfa, 9).where(Cfb, 10).where(Cfc, 11)
  .where(Csa, 12).where(Csb, 13).where(Csc, 14)
  .where(Cwa, 15).where(Cwb, 16).where(Cwc, 17)
  .where(Dfa, 18).where(Dfb, 19).where(Dfc, 20).where(Dfd, 21)
  .where(Dsa, 22).where(Dsb, 23).where(Dsc, 24).where(Dsd, 25)
  .where(Dwa, 26).where(Dwb, 27).where(Dwc, 28).where(Dwd, 29)
  .where(ET, 30).where(EF, 31)
  .where(BSh, 5).where(BSk, 6).where(BWh, 7).where(BWk, 8)
  .clip(brasilGeom);


// ==========================================================
// 14. LEGENDA E PALETA
// ==========================================================
var legenda = ee.Dictionary({
  1: 'Af', 2: 'Am', 3: 'As', 4: 'Aw',
  5: 'BSh', 6: 'BSk', 7: 'BWh', 8: 'BWk',
  9: 'Cfa', 10: 'Cfb', 11: 'Cfc',
  12: 'Csa', 13: 'Csb', 14: 'Csc',
  15: 'Cwa', 16: 'Cwb', 17: 'Cwc',
  18: 'Dfa', 19: 'Dfb', 20: 'Dfc', 21: 'Dfd',
  22: 'Dsa', 23: 'Dsb', 24: 'Dsc', 25: 'Dsd',
  26: 'Dwa', 27: 'Dwb', 28: 'Dwc', 29: 'Dwd',
  30: 'ET', 31: 'EF'
});

var paleta = [
  '0000FF', '0078FF', '46A0FF', '96C8FF',
  'F5A623', 'FFDA8C', 'FF0000', 'FF9696',
  'C8FF50', '64FF50', '32C800',
  'FFFF00', 'C8C800', '969600',
  'C8FFC8', '96FF96', '64C864',
  'B4A0FA', '8C78F0', '6450E6', '3C2CB4',
  'E0C8FF', 'C8A0FF', 'B478FF', '9650FF',
  'D2D2FF', 'AAAAFF', '8282FF', '5A5AFF',
  'B4B4B4', '696969'
];


// ==========================================================
// 15. STACK COMBINADO — classificação + variáveis climáticas
//     (para amostrar tudo de uma vez só no centroide)
// ==========================================================
var stackFinal = klass
  .addBands(tempAnual)
  .addBands(tempMesMaisFrio)
  .addBands(tempMesMaisQuente)
  .addBands(precAnual)
  .addBands(mesMaisSeco);


// ==========================================================
// 16. CENTROIDES DOS MUNICÍPIOS + AMOSTRAGEM
// ==========================================================
var centroides = municipios.map(function (feat) {
  var centroide = feat.geometry().centroid(100);
  return ee.Feature(centroide).copyProperties(feat);
});

var amostras = stackFinal.sampleRegions({
  collection: centroides,
  scale: 5000,
  geometries: true
});


// ==========================================================
// 17. TABELA FINAL
// ==========================================================
var tabelaFinal = amostras
  .filter(ee.Filter.neq('koppen', 0))
  .map(function (feat) {
    var geom = feat.geometry();
    var lon = geom.coordinates().get(0);
    var lat = geom.coordinates().get(1);
    var codigo = ee.Number(feat.get('koppen'));
    var classe = legenda.get(codigo.format('%d'));

    return ee.Feature(null, {
      latitude: lat,
      longitude: lon,
      municipio: feat.get('ADM2_NAME'),
      municipio_codigo_gaul: feat.get('ADM2_CODE'),
      UF: feat.get('ADM1_NAME'),
      UF_codigo_gaul: feat.get('ADM1_CODE'),
      classe_koppen: classe,
      classe_koppen_codigo: codigo,
      temp_anual_c: feat.get('temp_anual'),
      temp_mes_mais_frio_c: feat.get('tcold'),
      temp_mes_mais_quente_c: feat.get('thot'),
      precip_anual_mm: feat.get('rann'),
      precip_mes_mais_seco_mm: feat.get('rdry')
    });
  });

print('Tabela final (10 primeiras linhas):', tabelaFinal.limit(10));


// ==========================================================
// 18. VISUALIZAÇÃO — classificação + limites do Brasil e dos estados
// ==========================================================
Map.centerObject(brasilGeom, 4);

Map.addLayer(klass, { min: 1, max: 31, palette: paleta }, 'Köppen-Geiger');

Map.addLayer(
  brasilEstados.style({ color: 'ffffff', fillColor: '00000000', width: 1 }),
  {}, 'Limites — Estados'
);

Map.addLayer(
  brasilPais.style({ color: '000000', fillColor: '00000000', width: 2 }),
  {}, 'Limite — Brasil'
);

Map.addLayer(centroides, { color: 'black' }, 'Centroides', false);


// ==========================================================
// 19. LEGENDA VISUAL NO MAPA
// ==========================================================
var legendaPanel = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
legendaPanel.add(ui.Label('Köppen-Geiger', { fontWeight: 'bold', fontSize: '14px' }));

var codigosOrdenados = Object.keys(legenda.getInfo()).map(Number).sort(function (a, b) { return a - b; });
codigosOrdenados.forEach(function (codigo) {
  var cor = paleta[codigo - 1];
  var linha = ui.Panel({
    widgets: [
      ui.Label('', { backgroundColor: '#' + cor, padding: '8px', margin: '0 6px 4px 0' }),
      ui.Label(legenda.getInfo()[codigo])
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });
  legendaPanel.add(linha);
});
Map.add(legendaPanel);


// ==========================================================
// 20. GRÁFICOS (ui.Chart)
// ==========================================================
var classesENomes = legenda.values();

var contagens = ee.List(classesENomes.map(function (nome) {
  return tabelaFinal.filter(ee.Filter.eq('classe_koppen', nome)).size();
}));

var chartFeatures = ee.FeatureCollection(
  classesENomes.zip(contagens).map(function (par) {
    par = ee.List(par);
    return ee.Feature(null, { classe: par.get(0), municipios: par.get(1) });
  })
);

var chartMunicipios = ui.Chart.feature.byFeature(chartFeatures, 'classe', 'municipios')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Nº de municípios por classe de Köppen-Geiger',
    hAxis: { title: 'Classe' },
    vAxis: { title: 'Nº de municípios' },
    legend: { position: 'none' },
    colors: ['1a9850']
  });
print(chartMunicipios);

var areaPixel = ee.Image.pixelArea().divide(1e6).rename('area_km2');

var areaPorClasse = areaPixel.addBands(klass).reduceRegion({
  reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'koppen' }),
  geometry: brasilGeom,
  scale: 10000,
  maxPixels: 1e12,
  bestEffort: true,
  tileScale: 4
});

areaPorClasse.evaluate(function (resultado) {
  var grupos = resultado.groups;
  var total = grupos.reduce(function (soma, g) { return soma + g.sum; }, 0);
  var legendaInfo = legenda.getInfo();

  var linhasChart = grupos
    .sort(function (a, b) { return b.sum - a.sum; })
    .map(function (g) {
      return { classe: legendaInfo[g.koppen], area_pct: (100 * g.sum / total) };
    });

  var fcArea = ee.FeatureCollection(linhasChart.map(function (l) {
    return ee.Feature(null, l);
  }));

  var chartArea = ui.Chart.feature.byFeature(fcArea, 'classe', 'area_pct')
    .setChartType('ColumnChart')
    .setOptions({
      title: '% da área do Brasil por classe de Köppen-Geiger',
      hAxis: { title: 'Classe' },
      vAxis: { title: '% da área' },
      legend: { position: 'none' },
      colors: ['4575b4']
    });
  print(chartArea);
});


// ==========================================================
// 21. EXPORTAR CSV
// ==========================================================
Export.table.toDrive({
  collection: tabelaFinal,
  description: 'koppen_municipios_brasil_completo',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
