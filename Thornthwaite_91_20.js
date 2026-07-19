// ==========================================================
// CLASSIFICAÇÃO DE THORNTHWAITE (1948) — BRASIL
// Base: TerraClimate (1991-2020)
// Metodologia: Tabelas 2-5 de Aparecido et al. (2016)
// Classificação no CENTROIDE dos municípios + raster clipado ao Brasil
// Exporta CSV (com variáveis climáticas + código numérico + códigos GAUL)
// + gráficos (ui.Chart) + camadas de limite (país e estados)
//
// BUGFIX: .toFloat() explícito após multiply() em climMensal() e
// estacaoPonderada() — sem isso, o GEE gera tipos incompatíveis entre as
// 12 imagens mensais quando os fatores de escala diferem (0.1 vs 1.0),
// e o ImageCollection.fromImages() falha com "Expected a homogeneous
// image collection... Mismatched type for band 'ro'".
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
// 3. CLIMATOLOGIA MENSAL (pet, def, ro — com .toFloat() explícito)
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

var climPet = climMensal('pet', 0.1);  // mm/mês
var climDef = climMensal('def', 0.1);  // mm/mês (déficit hídrico)
var climRo  = climMensal('ro',  1.0);  // mm/mês (escoamento — proxy do excedente hídrico)


// ==========================================================
// 4. VARIÁVEIS ANUAIS (já clipadas ao Brasil)
// ==========================================================
var PETY = climPet.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('pety');
var DEF_ann = climDef.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('def_ann');
var SUR_ann = climRo.reduce(ee.Reducer.sum()).clip(brasilGeom).rename('sur_ann');

var MESES_VERAO = [10, 11, 12, 1, 2, 3];
var PETS = climPet.filter(ee.Filter.inList('month', MESES_VERAO))
  .reduce(ee.Reducer.sum()).clip(brasilGeom).rename('pets');


// ==========================================================
// 5. SAZONALIDADE PONDERADA (Tabela 1, Aparecido et al. 2016)
//    Verão = 1/3 Dez + Jan + Fev + 2/3 Mar | Inverno = 2/3 Jun + Jul + Ago + 2/3 Set
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
var W_INVERNO = { 6: 2 / 3, 7: 1, 8: 1, 9: 2 / 3 };

var DEF_verao = estacaoPonderada(climDef, W_VERAO).rename('def_verao');
var DEF_inverno = estacaoPonderada(climDef, W_INVERNO).rename('def_inverno');
var SUR_verao = estacaoPonderada(climRo, W_VERAO).rename('sur_verao');
var SUR_inverno = estacaoPonderada(climRo, W_INVERNO).rename('sur_inverno');


// ==========================================================
// 6. ÍNDICES DE THORNTHWAITE
// ==========================================================
var PETY_safe = PETY.max(1);

var Ih = SUR_ann.divide(PETY_safe).multiply(100).rename('ih');
var Ia = DEF_ann.divide(PETY_safe).multiply(100).rename('ia');
var Im = Ih.subtract(Ia.multiply(0.6)).rename('im');


// ==========================================================
// 7. TABELA 2 — CLASSE DE UMIDADE (1ª letra; SEM apóstrofo)
// ==========================================================
var thClasse = ee.Image(0).rename('th_classe')
  .where(Im.gte(100), 1)
  .where(Im.gte(80).and(Im.lt(100)), 2)
  .where(Im.gte(60).and(Im.lt(80)), 3)
  .where(Im.gte(40).and(Im.lt(60)), 4)
  .where(Im.gte(20).and(Im.lt(40)), 5)
  .where(Im.gte(0).and(Im.lt(20)), 6)
  .where(Im.gte(-20).and(Im.lt(0)), 7)
  .where(Im.gte(-40).and(Im.lt(-20)), 8)
  .where(Im.lt(-40), 9)
  .clip(brasilGeom);


// ==========================================================
// 8. TABELA 3 — SUBTIPO r/s/w/s2/w2 (2ª letra)
// ==========================================================
var grupoUmido = Im.gte(0);

var defVeraoMaior = DEF_verao.gt(DEF_inverno);
var surVeraoMaior = SUR_verao.gt(SUR_inverno);

var thSub = ee.Image(0).rename('th_sub')
  .where(grupoUmido.and(Ia.gte(0)).and(Ia.lt(16.7)), 1)
  .where(grupoUmido.and(Ia.gte(16.7)).and(Ia.lt(33.3)).and(defVeraoMaior), 2)
  .where(grupoUmido.and(Ia.gte(16.7)).and(Ia.lt(33.3)).and(defVeraoMaior.not()), 3)
  .where(grupoUmido.and(Ia.gte(33.3)).and(defVeraoMaior), 4)
  .where(grupoUmido.and(Ia.gte(33.3)).and(defVeraoMaior.not()), 5)
  .where(grupoUmido.not().and(Ih.gte(0)).and(Ih.lt(10)), 6)
  .where(grupoUmido.not().and(Ih.gte(10)).and(Ih.lt(20)).and(surVeraoMaior), 7)
  .where(grupoUmido.not().and(Ih.gte(10)).and(Ih.lt(20)).and(surVeraoMaior.not()), 8)
  .where(grupoUmido.not().and(Ih.gte(20)).and(surVeraoMaior), 9)
  .where(grupoUmido.not().and(Ih.gte(20)).and(surVeraoMaior.not()), 10)
  .clip(brasilGeom);


// ==========================================================
// 9. TABELA 4 — EFICIÊNCIA TÉRMICA ANUAL (PETY, com apóstrofo)
// ==========================================================
var thPety = ee.Image(0).rename('th_pety')
  .where(PETY.gte(1140), 1)
  .where(PETY.gte(997).and(PETY.lt(1140)), 2)
  .where(PETY.gte(885).and(PETY.lt(997)), 3)
  .where(PETY.gte(712).and(PETY.lt(885)), 4)
  .where(PETY.gte(570).and(PETY.lt(712)), 5)
  .where(PETY.gte(427).and(PETY.lt(570)), 6)
  .where(PETY.gte(285).and(PETY.lt(427)), 7)
  .where(PETY.gte(142).and(PETY.lt(285)), 8)
  .where(PETY.lt(142), 9)
  .clip(brasilGeom);


// ==========================================================
// 10. TABELA 5 — CONCENTRAÇÃO ESTIVAL DA PET (PETR, com apóstrofo)
// ==========================================================
var PETR = PETS.divide(PETY_safe).multiply(100);

var thPetr = ee.Image(0).rename('th_petr')
  .where(PETR.lt(48), 1)
  .where(PETR.gte(48).and(PETR.lt(51.9)), 2)
  .where(PETR.gte(51.9).and(PETR.lt(56.3)), 3)
  .where(PETR.gte(56.3).and(PETR.lt(61.6)), 4)
  .where(PETR.gte(61.6).and(PETR.lt(68)), 5)
  .where(PETR.gte(68).and(PETR.lt(76.3)), 6)
  .where(PETR.gte(76.3).and(PETR.lt(88)), 7)
  .where(PETR.gte(88), 8)
  .clip(brasilGeom);


// ==========================================================
// 11. DICIONÁRIOS DE LEGENDA
// ==========================================================
var legClasse = ee.Dictionary({ 1: 'A', 2: 'B4', 3: 'B3', 4: 'B2', 5: 'B1', 6: 'C2', 7: 'C1', 8: 'D', 9: 'E' });
var legSub = ee.Dictionary({ 0: '', 1: 'r', 2: 's', 3: 'w', 4: 's2', 5: 'w2', 6: 'd', 7: 's', 8: 'w', 9: 's2', 10: 'w2' });
var legPety = ee.Dictionary({ 1: "A'", 2: "B4'", 3: "B3'", 4: "B2'", 5: "B1'", 6: "C2'", 7: "C1'", 8: "D'", 9: "E'" });
var legPetr = ee.Dictionary({ 1: "a'", 2: "b4'", 3: "b3'", 4: "b2'", 5: "b1'", 6: "c2'", 7: "c1'", 8: "d'" });


// ==========================================================
// 12. STACK COMBINADO
// ==========================================================
var stackFinal = thClasse
  .addBands(thSub)
  .addBands(thPety)
  .addBands(thPetr)
  .addBands(PETY)
  .addBands(DEF_ann)
  .addBands(SUR_ann)
  .addBands(Im)
  .addBands(Ih)
  .addBands(Ia);


// ==========================================================
// 13. CENTROIDES + AMOSTRAGEM
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
// 14. TABELA FINAL
// ==========================================================
var tabelaFinal = amostras
  .filter(ee.Filter.neq('th_classe', 0))
  .map(function (feat) {
    var geom = feat.geometry();
    var lon = geom.coordinates().get(0);
    var lat = geom.coordinates().get(1);

    var codClasse = ee.Number(feat.get('th_classe'));
    var codSub = ee.Number(feat.get('th_sub'));
    var codPety = ee.Number(feat.get('th_pety'));
    var codPetr = ee.Number(feat.get('th_petr'));

    var classe = legClasse.get(codClasse.format('%d'));
    var sub = legSub.get(codSub.format('%d'));
    var pety = legPety.get(codPety.format('%d'));
    var petr = legPetr.get(codPetr.format('%d'));

    var completo = ee.String(classe).cat(sub).cat(pety).cat(petr);

    return ee.Feature(null, {
      latitude: lat,
      longitude: lon,
      municipio: feat.get('ADM2_NAME'),
      municipio_codigo_gaul: feat.get('ADM2_CODE'),
      UF: feat.get('ADM1_NAME'),
      UF_codigo_gaul: feat.get('ADM1_CODE'),
      th_classe: classe,
      th_classe_codigo: codClasse,
      th_subtipo: sub,
      th_pety: pety,
      th_petr: petr,
      thornthwaite_completo: completo,
      pet_anual_mm: feat.get('pety'),
      def_anual_mm: feat.get('def_ann'),
      excedente_anual_mm: feat.get('sur_ann'),
      indice_umidade_im: feat.get('im'),
      indice_hidrico_ih: feat.get('ih'),
      indice_aridez_ia: feat.get('ia')
    });
  });

print('Tabela final (10 primeiras linhas):', tabelaFinal.limit(10));


// ==========================================================
// 15. VISUALIZAÇÃO
// ==========================================================
Map.centerObject(brasilGeom, 4);

var paletaClasse = ['8c2d04', 'cc4c02', 'ec7014', 'fe9929', 'fec44f', 'a6d96a', 'fee08b', 'abd9e9', '4575b4'];

Map.addLayer(thClasse.updateMask(thClasse.gt(0)),
  { min: 1, max: 9, palette: paletaClasse },
  'Thornthwaite — classe de umidade');

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
// 16. LEGENDA VISUAL NO MAPA
// ==========================================================
var legendaPanel = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
legendaPanel.add(ui.Label('Thornthwaite — classe de umidade', { fontWeight: 'bold', fontSize: '14px' }));

var codigosOrdenados = Object.keys(legClasse.getInfo()).map(Number).sort(function (a, b) { return a - b; });
codigosOrdenados.forEach(function (codigo) {
  var cor = paletaClasse[codigo - 1];
  var linha = ui.Panel({
    widgets: [
      ui.Label('', { backgroundColor: '#' + cor, padding: '8px', margin: '0 6px 4px 0' }),
      ui.Label(legClasse.getInfo()[codigo])
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });
  legendaPanel.add(linha);
});
Map.add(legendaPanel);


// ==========================================================
// 17. GRÁFICOS (ui.Chart)
// ==========================================================
var nomesClasses = legClasse.values();
var contagens = ee.List(nomesClasses.map(function (nome) {
  return tabelaFinal.filter(ee.Filter.eq('th_classe', nome)).size();
}));

var chartFeatures = ee.FeatureCollection(
  nomesClasses.zip(contagens).map(function (par) {
    par = ee.List(par);
    return ee.Feature(null, { classe: par.get(0), municipios: par.get(1) });
  })
);

var chartMunicipios = ui.Chart.feature.byFeature(chartFeatures, 'classe', 'municipios')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Nº de municípios por classe de umidade (Thornthwaite)',
    hAxis: { title: 'Classe' },
    vAxis: { title: 'Nº de municípios' },
    legend: { position: 'none' },
    colors: ['fe9929']
  });
print(chartMunicipios);

var areaPixel = ee.Image.pixelArea().divide(1e6).rename('area_km2');

var areaPorClasse = areaPixel.addBands(thClasse).reduceRegion({
  reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'th_classe' }),
  geometry: brasilGeom,
  scale: 10000,
  maxPixels: 1e12,
  bestEffort: true,
  tileScale: 4
});

areaPorClasse.evaluate(function (resultado) {
  var grupos = resultado.groups;
  var total = grupos.reduce(function (soma, g) { return soma + g.sum; }, 0);
  var legendaInfo = legClasse.getInfo();

  var linhasChart = grupos
    .sort(function (a, b) { return b.sum - a.sum; })
    .map(function (g) {
      return { classe: legendaInfo[g.th_classe], area_pct: (100 * g.sum / total) };
    });

  var fcArea = ee.FeatureCollection(linhasChart.map(function (l) {
    return ee.Feature(null, l);
  }));

  var chartArea = ui.Chart.feature.byFeature(fcArea, 'classe', 'area_pct')
    .setChartType('ColumnChart')
    .setOptions({
      title: '% da área do Brasil por classe de umidade (Thornthwaite)',
      hAxis: { title: 'Classe' },
      vAxis: { title: '% da área' },
      legend: { position: 'none' },
      colors: ['4575b4']
    });
  print(chartArea);
});


// ==========================================================
// 18. EXPORTAR CSV
// ==========================================================
Export.table.toDrive({
  collection: tabelaFinal,
  description: 'thornthwaite_municipios_brasil_completo',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});
