// ==========================================================
// CLASSIFICAÇÃO DE CAMARGO (1991) mod. MALUF (2000) — BRASIL
// Base: TerraClimate (1991-2020)
// Metodologia: Tabelas 6-8 de Aparecido et al. (2016)
// Classificação no CENTROIDE dos municípios + raster clipado ao Brasil
// Exporta CSV (com variáveis climáticas + código numérico + códigos GAUL)
// + gráficos (ui.Chart) + camadas de limite (país e estados)
//
// BUGFIX: .toFloat() explícito após multiply() em climMensal() e
// estacaoPonderada() — sem isso, o GEE gera tipos incompatíveis entre as
// 12 imagens mensais quando os fatores de escala diferem, e o
// ImageCollection.fromImages()/ImageCollection() falha com "Expected a
// homogeneous image collection... Mismatched type for band 'def'".
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

var meses = ee.List.sequence(1, 12);


// ==========================================================
// 3. TEMPERATURA MÉDIA MENSAL (.toFloat() explícito)
// ==========================================================
function calcularTmedia(img) {
  var tmed = img.select('tmmx')
    .add(img.select('tmmn'))
    .divide(2)
    .multiply(0.1)
    .toFloat()               // <-- BUGFIX
    .rename('tmed');
  return tmed.copyProperties(img, ['system:time_start']);
}

var tmedCollection = terraclimate.map(calcularTmedia);

var climTmed = ee.ImageCollection.fromImages(
  meses.map(function (mes) {
    return tmedCollection
      .filter(ee.Filter.calendarRange(mes, mes, 'month'))
      .mean()
      .toFloat()               // <-- BUGFIX
      .rename('tmed')
      .set('month', mes);
  })
);


// ==========================================================
// 4. CLIMATOLOGIA MENSAL (def, ro — .toFloat() explícito)
// ==========================================================
function climMensal(banda, escala) {
  return ee.ImageCollection.fromImages(
    meses.map(function (mes) {
      return terraclimate
        .filter(ee.Filter.calendarRange(mes, mes, 'month'))
        .select(banda)
        .mean()
        .multiply(escala)
        .toFloat()               // <-- BUGFIX
        .rename(banda)
        .set('month', mes);
    })
  );
}

var climDef = climMensal('def', 0.1);  // mm/mês (déficit hídrico)
var climRo  = climMensal('ro',  1.0);  // mm/mês (escoamento — proxy do excedente hídrico)


// ==========================================================
// 5. VARIÁVEIS ANUAIS (já clipadas ao Brasil)
// ==========================================================
var Tann = climTmed.mean().clip(brasilGeom).rename('tann');
var Tcold = climTmed.reduce(ee.Reducer.min()).clip(brasilGeom).rename('tcold');
var DEF_ann = climDef.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('def_ann');
var SUR_ann = climRo.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('sur_ann');


// ==========================================================
// 6. SAZONALIDADE PONDERADA (Tabela 1, Aparecido et al. 2016), .toFloat() explícito
// ==========================================================
function estacaoPonderada(colecaoMensal, pesos) {
  var imagens = Object.keys(pesos).map(function (mesStr) {
    var mes = parseInt(mesStr, 10);
    var peso = pesos[mesStr];
    return colecaoMensal.filter(ee.Filter.eq('month', mes)).first()
      .multiply(peso)
      .toFloat();               // <-- BUGFIX
  });
  return ee.ImageCollection(imagens).sum();
}

var W_VERAO = { 12: 1 / 3, 1: 1, 2: 1, 3: 2 / 3 };
var W_OUTONO = { 3: 1 / 3, 4: 1, 5: 1, 6: 1 / 3 };
var W_INVERNO = { 6: 2 / 3, 7: 1, 8: 1, 9: 2 / 3 };
var W_PRIMAVERA = { 9: 1 / 3, 10: 1, 11: 1, 12: 2 / 3 };

var DEF_verao = estacaoPonderada(climDef, W_VERAO).rename('def_verao');
var DEF_outono = estacaoPonderada(climDef, W_OUTONO).rename('def_outono');
var DEF_inverno = estacaoPonderada(climDef, W_INVERNO).rename('def_inverno');
var DEF_primavera = estacaoPonderada(climDef, W_PRIMAVERA).rename('def_primavera');


// ==========================================================
// 7. TABELA 6 — CLASSE TÉRMICA
// ==========================================================
var cmTermico = ee.Image(0).rename('cm_termico')
  .where(Tann.lte(3), 1)
  .where(Tann.gt(3).and(Tann.lte(7)), 2)
  .where(Tann.gt(7).and(Tann.lte(12)), 3)
  .where(Tann.gt(12).and(Tann.lte(18)), 4)
  .where(Tann.gt(18).and(Tann.lte(22)).and(Tcold.lte(13)), 5)
  .where(Tann.gt(18).and(Tann.lte(22)).and(Tcold.gt(13)).and(Tcold.lte(20)), 6)
  .where(Tann.gt(22).and(Tann.lte(25)), 7)
  .where(Tann.gt(25), 8)
  .where(Tcold.gt(20), 7)
  .clip(brasilGeom);


// ==========================================================
// 8. TABELA 7 — CLASSE HÍDRICA (DEF/SUR anuais)
// ==========================================================
var cmHidrico = ee.Image(0).rename('cm_hidrico')
  .where(DEF_ann.gt(800).and(SUR_ann.lte(0)), 1)
  .where(DEF_ann.gt(150).and(DEF_ann.lte(800)).and(SUR_ann.lte(0)), 2)
  .where(DEF_ann.gt(150).and(SUR_ann.gt(0)).and(SUR_ann.lte(200)), 3)
  .where(DEF_ann.gt(150).and(SUR_ann.gt(200)), 4)
  .where(DEF_ann.gt(0).and(DEF_ann.lte(150)).and(SUR_ann.gt(0)).and(SUR_ann.lte(200)), 5)
  .where(DEF_ann.gt(0).and(DEF_ann.lte(150)).and(SUR_ann.gt(200)), 6)
  .where(DEF_ann.lte(0).and(SUR_ann.gt(200)).and(SUR_ann.lte(1000)), 7)
  .where(DEF_ann.lte(0).and(SUR_ann.gt(1000)), 8)
  .clip(brasilGeom);


// ==========================================================
// 9. TABELA 8 — LETRA DE ESTAÇÃO SECA (só para SE, MO, SB, UM)
// ==========================================================
var precisaLetra = cmHidrico.eq(3).or(cmHidrico.eq(4)).or(cmHidrico.eq(5)).or(cmHidrico.eq(6));

var defEstacoes = ee.Image.cat([DEF_verao, DEF_outono, DEF_inverno, DEF_primavera]);
var estacaoArgmax = defEstacoes.toArray().arrayArgmax().arrayGet(0).rename('estacao_argmax');

var cmLetra = ee.Image(0).rename('cm_letra')
  .where(precisaLetra.and(estacaoArgmax.eq(0)), 1)
  .where(precisaLetra.and(estacaoArgmax.eq(1)), 2)
  .where(precisaLetra.and(estacaoArgmax.eq(2)), 3)
  .where(precisaLetra.and(estacaoArgmax.eq(3)), 4)
  .clip(brasilGeom);


// ==========================================================
// 10. DICIONÁRIOS DE LEGENDA
// ==========================================================
var legTermico = ee.Dictionary({ 1: 'GL', 2: 'FR', 3: 'CO', 4: 'TE', 5: 'STE', 6: 'ST', 7: 'TR', 8: 'EQ' });
var legHidrico = ee.Dictionary({ 1: 'DE', 2: 'AR', 3: 'SE', 4: 'MO', 5: 'SB', 6: 'UM', 7: 'PU', 8: 'SU' });
var legLetra = ee.Dictionary({ 0: '', 1: 'v', 2: 'o', 3: 'i', 4: 'p' });


// ==========================================================
// 11. STACK COMBINADO
// ==========================================================
var stackFinal = cmTermico
  .addBands(cmHidrico)
  .addBands(cmLetra)
  .addBands(Tann)
  .addBands(Tcold)
  .addBands(DEF_ann)
  .addBands(SUR_ann);


// ==========================================================
// 12. CENTROIDES + AMOSTRAGEM
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
// 13. TABELA FINAL
// ==========================================================
var tabelaFinal = amostras
  .filter(ee.Filter.neq('cm_termico', 0))
  .map(function (feat) {
    var geom = feat.geometry();
    var lon = geom.coordinates().get(0);
    var lat = geom.coordinates().get(1);

    var codTermico = ee.Number(feat.get('cm_termico'));
    var codHidrico = ee.Number(feat.get('cm_hidrico'));
    var codLetra = ee.Number(feat.get('cm_letra'));

    var termico = legTermico.get(codTermico.format('%d'));
    var hidrico = legHidrico.get(codHidrico.format('%d'));
    var letra = legLetra.get(codLetra.format('%d'));

    var completo = ee.String(termico).cat('-').cat(hidrico).cat(letra);

    return ee.Feature(null, {
      latitude: lat,
      longitude: lon,
      municipio: feat.get('ADM2_NAME'),
      municipio_codigo_gaul: feat.get('ADM2_CODE'),
      UF: feat.get('ADM1_NAME'),
      UF_codigo_gaul: feat.get('ADM1_CODE'),
      cm_termico: termico,
      cm_termico_codigo: codTermico,
      cm_hidrico: hidrico,
      cm_hidrico_codigo: codHidrico,
      cm_letra_seca: letra,
      camargo_completo: completo,
      temp_anual_c: feat.get('tann'),
      temp_mes_mais_frio_c: feat.get('tcold'),
      def_anual_mm: feat.get('def_ann'),
      excedente_anual_mm: feat.get('sur_ann')
    });
  });

print('Tabela final (10 primeiras linhas):', tabelaFinal.limit(10));


// ==========================================================
// 14. VISUALIZAÇÃO
// ==========================================================
Map.centerObject(brasilGeom, 4);

var paletaTermico = ['4575b4', '74add1', 'abd9e9', 'fee08b', 'fdae61', 'f46d43', 'd73027', 'a50026'];

Map.addLayer(cmTermico.updateMask(cmTermico.gt(0)),
  { min: 1, max: 8, palette: paletaTermico },
  'Camargo — classe térmica');

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
// 15. LEGENDA VISUAL NO MAPA
// ==========================================================
var legendaPanel = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
legendaPanel.add(ui.Label('Camargo — classe térmica', { fontWeight: 'bold', fontSize: '14px' }));

var codigosOrdenados = Object.keys(legTermico.getInfo()).map(Number).sort(function (a, b) { return a - b; });
codigosOrdenados.forEach(function (codigo) {
  var cor = paletaTermico[codigo - 1];
  var linha = ui.Panel({
    widgets: [
      ui.Label('', { backgroundColor: '#' + cor, padding: '8px', margin: '0 6px 4px 0' }),
      ui.Label(legTermico.getInfo()[codigo])
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });
  legendaPanel.add(linha);
});
Map.add(legendaPanel);


// ==========================================================
// 16. GRÁFICOS (ui.Chart)
// ==========================================================
var nomesTermicos = legTermico.values();
var contagens = ee.List(nomesTermicos.map(function (nome) {
  return tabelaFinal.filter(ee.Filter.eq('cm_termico', nome)).size();
}));

var chartFeatures = ee.FeatureCollection(
  nomesTermicos.zip(contagens).map(function (par) {
    par = ee.List(par);
    return ee.Feature(null, { classe: par.get(0), municipios: par.get(1) });
  })
);

var chartMunicipios = ui.Chart.feature.byFeature(chartFeatures, 'classe', 'municipios')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Nº de municípios por classe térmica (Camargo)',
    hAxis: { title: 'Classe' },
    vAxis: { title: 'Nº de municípios' },
    legend: { position: 'none' },
    colors: ['d73027']
  });
print(chartMunicipios);

var areaPixel = ee.Image.pixelArea().divide(1e6).rename('area_km2');

var areaPorClasse = areaPixel.addBands(cmTermico).reduceRegion({
  reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'cm_termico' }),
  geometry: brasilGeom,
  scale: 10000,
  maxPixels: 1e12,
  bestEffort: true,
  tileScale: 4
});

areaPorClasse.evaluate(function (resultado) {
  var grupos = resultado.groups;
  var total = grupos.reduce(function (soma, g) { return soma + g.sum; }, 0);
  var legendaInfo = legTermico.getInfo();

  var linhasChart = grupos
    .sort(function (a, b) { return b.sum - a.sum; })
    .map(function (g) {
      return { classe: legendaInfo[g.cm_termico], area_pct: (100 * g.sum / total) };
    });

  var fcArea = ee.FeatureCollection(linhasChart.map(function (l) {
    return ee.Feature(null, l);
  }));

  var chartArea = ui.Chart.feature.byFeature(fcArea, 'classe', 'area_pct')
    .setChartType('ColumnChart')
    .setOptions({
      title: '% da área do Brasil por classe térmica (Camargo)',
      hAxis: { title: 'Classe' },
      vAxis: { title: '% da área' },
      legend: { position: 'none' },
      colors: ['4575b4']
    });
  print(chartArea);
});


// ==========================================================
// 17. EXPORTAR CSV
// ==========================================================
Export.table.toDrive({
  collection: tabelaFinal,
  description: 'camargo_municipios_brasil_completo',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
