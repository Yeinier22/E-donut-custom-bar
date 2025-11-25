// Demo D3 Donut Chart - Debug Version
// Replica el código de visual.ts con logs visibles

// Constantes idénticas al visual
const DONUT_CONFIG = {
  INNER_RADIUS_RATIO: 0.4,
  OUTER_RADIUS_RATIO: 0.8,
  LINE_START_RATIO: 0.9,
  MARGIN: 50,
  TEXT_SPACING: 10,
  DEFAULT_LINE_LENGTH: 20,
  MIN_LINE_LENGTH: 0,
  MAX_LINE_LENGTH: 100
};

// Estado global (como en el visual)
let isDrilled = false;
let drillCategory = null;
let drillCategoryKey = null;
let baseCategories = [];
let currentCategories = [];
let currentDataView = null;

// Simular categoryObjects para almacenar colores personalizados
let customColors = {
  base: {}, // { categoryIndex: color }
  drill: {}  // { categoryIndex: color }
};

// Logging
function log(message, data = null) {
  console.log(message, data);
  const logOutput = document.getElementById('log-output');
  const logEntry = document.createElement('div');
  logEntry.innerHTML = `<strong>${new Date().toLocaleTimeString()}:</strong> ${message}`;
  if (data) {
    const dataDiv = document.createElement('div');
    dataDiv.innerHTML = `<code>${JSON.stringify(data, null, 2)}</code>`;
    dataDiv.style.background = '#f0f0f0';
    dataDiv.style.margin = '2px 0';
    dataDiv.style.padding = '2px';
    logEntry.appendChild(dataDiv);
  }
  logOutput.appendChild(logEntry);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function updateStatus() {
  const status = document.getElementById('status');
  status.innerHTML = `
    <div>isDrilled: ${isDrilled}</div>
    <div>drillCategory: ${drillCategory}</div>
    <div>baseCategories: ${baseCategories.length}</div>
    <div>currentCategories: ${currentCategories.length}</div>
  `;
}

// Función de prueba para generateAllCategoryNames
function testGenerateAllCategoryNames(dataView) {
  log('🔍 TEST: generateAllCategoryNames - dataView:', dataView);
  
  const names = [];
  const categorical = dataView.categorical;
  
  log('🔍 TEST: categorical:', categorical);
  log('🔍 TEST: categories length:', categorical?.categories?.length);
  
  if (!categorical || !categorical.categories || categorical.categories.length < 2) {
    log('❌ TEST: No hay estructura de drill adecuada');
    for (let i = 0; i < 10; i++) {
      names.push(`Category ${i}`);
    }
    return names;
  }

  const cat1 = categorical.categories[0].values;
  const cat2 = categorical.categories[1].values;
  const rowCount = cat1.length;

  log('📊 TEST: Datos de categorías:');
  log('  - cat1 (primera categoría):', cat1);
  log('  - cat2 (segunda categoría):', cat2);
  log('  - rowCount:', rowCount);

  // Crear un mapa ordenado de todas las combinaciones únicas
  const combinationsOrder = [];
  const seen = new Set();
  
  for (let i = 0; i < rowCount; i++) {
    const category1 = String(cat1[i] || '');
    const category2 = String(cat2[i] || '');
    
    if (category1 && category2) {
      const combinationKey = `${category1}-${category2}`;
      if (!seen.has(combinationKey)) {
        seen.add(combinationKey);
        combinationsOrder.push(combinationKey);
        log(`  ➕ TEST: Nueva combinación [${combinationsOrder.length - 1}]: ${combinationKey}`);
      }
    }
  }
  
  log('🏷️ TEST: Combinaciones únicas encontradas:', combinationsOrder);
  
  // Asignar hasta 10 nombres basándose en las combinaciones reales
  for (let i = 0; i < 10; i++) {
    if (i < combinationsOrder.length) {
      names.push(combinationsOrder[i]);
    } else {
      names.push(`Category ${i}`); // Fallback para índices sin combinaciones
    }
  }
  
  log('✅ TEST: Nombres finales generados:', names);
  return names;
}

// Datos de ejemplo
const sampleDataSingle = {
  categorical: {
    categories: [
      { 
        values: ['Low Income', 'Low Income', 'Low Income', 'Low Income', 'Low Income', 'Low Income',
                 'Middle Income', 'Middle Income', 'Middle Income', 'Middle Income',
                 'High Income', 'High Income', 'High Income'],
        objects: []
      }
    ],
    values: [
      { values: [100, 150, 80, 120, 50, 70, 200, 180, 160, 140, 300, 250, 280] }
    ]
  }
};

const sampleDataDouble = {
  categorical: {
    categories: [
      { 
        values: ['Low Income', 'Low Income', 'Low Income', 'Low Income', 'Low Income', 'Low Income',
                 'Middle Income', 'Middle Income', 'Middle Income',
                 'High Income', 'High Income'],
        objects: [] // Se llenará dinámicamente cuando se cambien colores
      },
      { 
        values: ['Asia', 'Europe', 'Africa', 'Americas', 'Oceania', 'Other',
                 'Asia', 'Europe', 'Americas',
                 'Asia', 'Europe'],
        objects: [] // Se llenará dinámicamente
      }
    ],
    values: [
      { values: [100, 150, 80, 120, 50, 70, 200, 180, 160, 300, 250] }
    ]
  }
};

// Funciones del visual replicadas
function createViewModel(dataView) {
  const categorical = dataView.categorical;
  if (!categorical || !categorical.categories || !categorical.values) {
    return [];
  }

  if (isDrilled && categorical.categories.length > 1 && drillCategory) {
    log('Building drill data for:', drillCategory);
    return buildDrillData(dataView, drillCategory);
  } else {
    log('Building main data');
    return buildMainData(dataView);
  }
}

function buildMainData(dataView) {
  const categorical = dataView.categorical;
  const cat1Values = categorical.categories[0].values;
  const allValues = categorical.values[0].values;
  
  log('Building main data', { cat1Values, allValues });
  
  // Aggregate by first category
  const categoryTotals = new Map();
  
  for (let i = 0; i < cat1Values.length; i++) {
    const category = cat1Values[i];
    const rawValue = allValues[i];
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    
    if (!isNaN(value) && isFinite(value)) {
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + value);
    }
  }
  
  // Get unique categories in order
  const uniqueCategories = [];
  const seen = new Set();
  for (const cat of cat1Values) {
    if (!seen.has(cat)) {
      seen.add(cat);
      uniqueCategories.push(cat);
    }
  }
  
  // Calculate total for percentages
  let total = 0;
  categoryTotals.forEach(value => total += value);
  
  // Build data points
  const dataPoints = [];
  for (const category of uniqueCategories) {
    const categoryName = category == null ? "(Blank)" : String(category);
    const value = categoryTotals.get(category) || 0;
    
    if (value > 0) {
      dataPoints.push({
        category: categoryName,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0
      });
    }
  }

  log('Main data result:', dataPoints);
  return dataPoints;
}

function buildDrillData(dataView, drillCategory) {
  const categorical = dataView.categorical;
  const cat1 = categorical.categories[0].values;
  
  // Check if second category exists
  if (!categorical.categories || categorical.categories.length < 2) {
    log('No second category available for drill');
    return [];
  }
  
  const cat2 = categorical.categories[1].values;
  const valuesCols = categorical.values || [];
  const rowCount = cat1.length;

  log('Building drill data', { drillCategory, cat1, cat2, valuesCols });

  // Exact match logic from ECharts version
  const matchesCategory = (value) => {
    if (drillCategoryKey !== undefined && drillCategoryKey !== null) {
      const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function")
        ? value.valueOf() : value;
      const keyPrimitive = (drillCategoryKey !== null && drillCategoryKey !== undefined && typeof drillCategoryKey.valueOf === "function")
        ? drillCategoryKey.valueOf() : drillCategoryKey;
      if (valuePrimitive === keyPrimitive || String(valuePrimitive) === String(keyPrimitive)) return true;
    }
    if (value === drillCategory) return true;
    if (value !== null && value !== undefined && drillCategory !== null && drillCategory !== undefined) {
      return String(value) === String(drillCategory);
    }
    return false;
  };

  const idxs = [];
  for (let i = 0; i < rowCount; i++) {
    if (matchesCategory(cat1[i])) idxs.push(i);
  }
  
  log('Matching indices:', idxs);
  
  const cat2Order = [];
  const seen = new Set();
  for (const i of idxs) {
    const v = cat2[i];
    if (!seen.has(v)) { seen.add(v); cat2Order.push(v); }
  }

  log('Category 2 order:', cat2Order);

  const toNumber = (x) => (x === null || x === undefined || x === "") ? 0 : (typeof x === "number" ? x : Number(x));
  const totals = new Map();

  // Helper to add from a column source
  const addFromSource = (src) => {
    for (const c2 of cat2Order) {
      let s = 0;
      for (const i of idxs) if (cat2[i] === c2) s += toNumber(src[i]);
      totals.set(c2, (totals.get(c2) || 0) + s);
    }
  };

  for (const mv of valuesCols) addFromSource(mv.values || []);

  // Convert to DonutDataPoint format
  const dataPoints = [];
  let total = 0;
  totals.forEach(value => total += value);
  
  cat2Order.forEach((name) => {
    const value = totals.get(name) || 0;
    if (value > 0) {
      dataPoints.push({
        category: String(name),
        value,
        percentage: total > 0 ? (value / total) * 100 : 0
      });
    }
  });
  
  log('Drill data result:', dataPoints);
  return dataPoints;
}

// D3 Rendering
class DonutRenderer {
  constructor(svg) {
    this.svg = svg;
  }

  render(viewModel, config, onSliceClick, onBackClick, isDrilled, drillCategory) {
    const { radius, width, height, spacing } = config;
    
    log('Rendering donut', { 
      viewModelLength: viewModel.length, 
      hasClickHandler: !!onSliceClick,
      isDrilled,
      drillCategory 
    });
    
    // Clear SVG
    this.svg.selectAll("*").remove();
    
    // Render navigation buttons if in drill mode
    if (isDrilled) {
      this.renderNavigationButtons(width, height, onBackClick, drillCategory);
    }
    
    // Calculate Y position using centerYPercent
    const centerY = (height * spacing.centerYPercent) / 100;
    
    const g = this.svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${centerY})`);

    // Configure D3 generators with custom spacing
    const pie = d3.pie().value(d => d.value);
    const innerRadius = radius * (spacing.innerRadiusPercent / 100);
    const outerRadius = radius * ((spacing.innerRadiusPercent + spacing.ringWidthPercent) / 100);
    
    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    // Render components - pass isDrilled para usar colores correctos
    this.renderDonut(g, viewModel, pie, arc, onSliceClick, isDrilled);
    this.renderLines(g, viewModel, pie, outerRadius);
    this.renderLabels(g, viewModel, pie, outerRadius);
  }

  renderDonut(g, viewModel, pie, arc, onSliceClick, isDrilled) {
    const defaultColors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"];
    
    log('Rendering donut arcs with click handler:', !!onSliceClick);
    log('Using colors for isDrilled:', isDrilled);
    
    g.selectAll("path")
      .data(pie(viewModel))
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d, i) => {
        const colorSource = isDrilled ? customColors.drill : customColors.base;
        const customColor = getCategoryColor(d.data.category, isDrilled);
        const finalColor = customColor || defaultColors[i % defaultColors.length];
        log(`Slice ${i} (${d.data.category}): custom=${customColor}, final=${finalColor}`);
        return finalColor;
      })
      .style("stroke", "#fff")
      .style("stroke-width", "2px")
      .style("cursor", onSliceClick ? "pointer" : "default")
      .on("click", onSliceClick ? function(d) {
        log('D3 click event fired:', d.data.category);
        onSliceClick(d.data.category);
      } : null);
  }

  renderLines(g, viewModel, pie, radius) {
    const lineLengthConfig = { mode: "all", globalLength: 20, categoryLengths: {} };
    
    g.selectAll("polyline")
      .data(pie(viewModel))
      .enter()
      .append("polyline")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("points", d => {
        const helpers = this.getGeometryHelpers(d, radius);
        const lineLength = 20; // simplified
        const points = this.calculateLinePoints(helpers, lineLength);
        return points.map(p => p.join(",")).join(" ");
      });
  }

  renderLabels(g, viewModel, pie, radius) {
    const pieData = pie(viewModel);
    pieData.forEach(d => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = 20;
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const fullText = `${d.data.category}: ${d.data.value} (${d.data.percentage.toFixed(1)}%)`;
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      
      g.append("text")
        .text(fullText)
        .attr("transform", `translate(${textX}, ${textY})`)
        .style("text-anchor", textAnchor)
        .style("font-size", "12px")
        .style("fill", "#444");
    });
  }

  renderNavigationButtons(width, height, onBackClick, drillCategory) {
    const backButton = this.svg.append("g")
      .attr("class", "nav-button")
      .attr("transform", "translate(20, 20)")
      .style("cursor", "pointer")
      .on("click", function() {
        log('Back button clicked');
        if (onBackClick) onBackClick();
      });
    
    backButton.append("text")
      .text("↩ Back")
      .style("font-family", "Segoe UI")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .style("fill", "#555");
    
    if (drillCategory) {
      this.svg.append("text")
        .text(`Details for ${drillCategory}`)
        .attr("x", width / 2)
        .attr("y", 30)
        .style("text-anchor", "middle")
        .style("font-family", "Segoe UI")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#333");
    }
  }

  getGeometryHelpers(d, outerRadius) {
    const mid = (d.startAngle + d.endAngle) / 2;
    const direction = mid < Math.PI ? 1 : -1;
    return {
      mid,
      direction,
      outerRadius: outerRadius,
      midRadius: outerRadius * 1.1
    };
  }

  calculateLinePoints(helpers, lineLength) {
    const { mid, direction, outerRadius, midRadius } = helpers;
    
    const startPoint = [
      Math.cos(mid - Math.PI / 2) * outerRadius,
      Math.sin(mid - Math.PI / 2) * outerRadius
    ];
    
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    const finalPoint = [
      midPoint[0] + (lineLength * direction),
      midPoint[1]
    ];

    return [startPoint, midPoint, finalPoint];
  }

  calculateTextPosition(helpers, lineLength) {
    const { mid, direction, midRadius } = helpers;
    
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    const textX = midPoint[0] + (lineLength * direction) + (DONUT_CONFIG.TEXT_SPACING * direction);
    const textY = midPoint[1];
    
    return [textX, textY];
  }

  getTextAnchor(d, radius, align) {
    if (align !== "auto") return align;
    const mid = (d.startAngle + d.endAngle) / 2;
    return mid < Math.PI ? "start" : "end";
  }
}

// Main update function
function updateChart() {
  log('=== UPDATE CHART ===');
  
  const dataView = currentDataView;
  if (!dataView) {
    log('No dataView available');
    return;
  }

  // Save base state if not drilled
  if (!isDrilled) {
    const categories = dataView.categorical.categories[0].values;
    baseCategories = [];
    const seen = new Set();
    for (const cat of categories) {
      if (!seen.has(cat)) {
        seen.add(cat);
        baseCategories.push(cat);
      }
    }
    currentCategories = [...baseCategories];
    log('Base categories saved:', baseCategories);
  }
  
  // Always enable click when not drilled
  const onSliceClick = !isDrilled ? (category) => {
    log('Slice clicked:', category);
    
    // Find the category key
    const clickedIndex = currentCategories.indexOf(category);
    const clickedKey = clickedIndex >= 0 && baseCategories && clickedIndex < baseCategories.length
      ? baseCategories[clickedIndex]
      : category;
    
    log('Click details:', { clickedIndex, clickedKey, currentCategories });
    
    // Execute drill down
    const drillData = buildDrillData(dataView, category);
    if (drillData && drillData.length > 0) {
      isDrilled = true;
      drillCategory = category;
      drillCategoryKey = clickedKey;
      currentCategories = drillData.map(d => d.category);
      log('Drilling down successfully');
      
      // TEST: Simular generateAllCategoryNames después del drill
      const allDrillCategoryNames = testGenerateAllCategoryNames(dataView);
      log('🎯 TEST: Nombres que se usarían en formatting model:', allDrillCategoryNames);
      
      updateStatus();
      updateChart(); // Re-render with drill data
    } else {
      log('No drill data available - not drilling');
    }
  } : undefined;
  
  const onBackClick = isDrilled ? () => {
    log('Back clicked - restoring base view');
    isDrilled = false;
    drillCategory = null;
    drillCategoryKey = null;
    currentCategories = [...baseCategories];
    updateStatus();
    updateChart(); // Re-render with main data
  } : undefined;

  log('Click handlers:', { hasSliceClick: !!onSliceClick, hasBackClick: !!onBackClick });

  // Process data
  const viewModel = createViewModel(dataView);
  if (!viewModel || viewModel.length === 0) {
    log('No viewModel data');
    return;
  }

  log('ViewModel created:', viewModel);

  // Configure rendering
  const width = 800;
  const height = 600;
  const spacingConfig = {
    innerRadiusPercent: 24,
    ringWidthPercent: 58,
    centerYPercent: 58
  };
  const radius = Math.min(width, height) / 2 - DONUT_CONFIG.MARGIN;
  
  const config = {
    radius,
    width,
    height,
    spacing: spacingConfig
  };

  // Render
  const svg = d3.select("#chart").select("svg");
  const renderer = new DonutRenderer(svg);
  renderer.render(viewModel, config, onSliceClick, onBackClick, isDrilled, drillCategory);
  
  updateStatus();
  updateColorPickers(); // Actualizar color pickers después de renderizar
}

// Initialize
function init() {
  log('Initializing demo');
  
  const svg = d3.select("#chart")
    .append("svg")
    .style("width", "100%")
    .style("height", "100%");
  
  updateData();
}

function updateData() {
  const select = document.getElementById('data-select');
  const selectedData = select.value === 'single' ? sampleDataSingle : sampleDataDouble;
  
  log('Loading data type:', select.value);
  
  // Reset state
  isDrilled = false;
  drillCategory = null;
  drillCategoryKey = null;
  baseCategories = [];
  currentCategories = [];
  
  currentDataView = selectedData;
  updateChart();
}

function resetDrill() {
  log('Manual reset drill');
  isDrilled = false;
  drillCategory = null;
  drillCategoryKey = null;
  currentCategories = [...baseCategories];
  updateStatus();
  updateChart();
}

// ===== FUNCIONES PARA DATA COLORS =====

function getCategoryColor(category, isDrill) {
  log(`getCategoryColor(${category}, isDrill=${isDrill})`);
  
  if (!currentDataView || !currentDataView.categorical || !currentDataView.categorical.categories) {
    log('  -> No dataView');
    return null;
  }
  
  const categoryIndex = isDrill ? 1 : 0;
  const objectName = isDrill ? "dataPointDrill" : "dataPoint";
  const categories = currentDataView.categorical.categories[categoryIndex];
  
  if (!categories) {
    log('  -> No categories at index', categoryIndex);
    return null;
  }
  
  const categoryValues = categories.values;
  const categoryObjects = categories.objects;
  
  log(`  -> categoryValues:`, categoryValues);
  log(`  -> categoryObjects:`, categoryObjects);
  
  if (!categoryObjects || categoryObjects.length === 0) {
    log('  -> No categoryObjects');
    return null;
  }
  
  for (let i = 0; i < categoryValues.length; i++) {
    const categoryName = categoryValues[i] == null ? "(Blank)" : String(categoryValues[i]);
    if (categoryName === category) {
      log(`  -> Found match at index ${i}`);
      if (categoryObjects[i] && categoryObjects[i][objectName] && categoryObjects[i][objectName]["fill"]) {
        const colorObj = categoryObjects[i][objectName]["fill"];
        log(`  -> Has color object:`, colorObj);
        return colorObj.solid.color;
      } else {
        log(`  -> No color at index ${i}`);
      }
    }
  }
  
  log('  -> No color found');
  return null;
}

function updateColorPickers() {
  log('=== UPDATING COLOR PICKERS ===');
  
  // Color pickers para categoría base
  const baseDiv = document.getElementById('color-pickers-base');
  baseDiv.innerHTML = '';
  
  if (baseCategories && baseCategories.length > 0) {
    const cat1Values = currentDataView.categorical.categories[0].values;
    log('Base categories:', baseCategories);
    log('cat1Values:', cat1Values);
    
    baseCategories.forEach((category, uniqueIndex) => {
      // AQUÍ ESTÁ LA LÓGICA ACTUAL DEL VISUAL
      const actualIndex = cat1Values.indexOf(category);
      
      log(`Category "${category}": uniqueIndex=${uniqueIndex}, actualIndex=${actualIndex}`);
      
      const defaultColors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"];
      const defaultColor = defaultColors[uniqueIndex % defaultColors.length];
      const currentColor = getCategoryColor(category, false) || defaultColor;
      
      const pickerDiv = document.createElement('div');
      pickerDiv.style.margin = '4px 0';
      pickerDiv.innerHTML = `
        <label style="font-size: 11px;">
          ${category}:
          <input type="color" 
                 value="${currentColor}" 
                 data-category="${category}" 
                 data-index="${actualIndex}"
                 data-drill="false"
                 onchange="onColorChange(this)">
          <span style="font-size: 10px; color: #666;">(idx: ${actualIndex})</span>
        </label>
      `;
      baseDiv.appendChild(pickerDiv);
    });
  }
  
  // Color pickers para drill
  const drillDiv = document.getElementById('color-pickers-drill');
  drillDiv.innerHTML = '';
  
  if (currentDataView.categorical.categories.length > 1) {
    const cat2Values = currentDataView.categorical.categories[1].values;
    const uniqueDrillCategories = [];
    const seen = new Set();
    
    for (const cat of cat2Values) {
      if (!seen.has(cat)) {
        seen.add(cat);
        uniqueDrillCategories.push(cat);
      }
    }
    
    log('Unique drill categories:', uniqueDrillCategories);
    log('cat2Values:', cat2Values);
    
    uniqueDrillCategories.forEach((category, uniqueIndex) => {
      const categoryName = category == null ? "(Blank)" : String(category);
      const actualIndex = cat2Values.indexOf(category);
      
      log(`Drill category "${categoryName}": uniqueIndex=${uniqueIndex}, actualIndex=${actualIndex}`);
      
      const defaultColors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"];
      const defaultColor = defaultColors[uniqueIndex % defaultColors.length];
      const currentColor = getCategoryColor(categoryName, true) || defaultColor;
      
      const pickerDiv = document.createElement('div');
      pickerDiv.style.margin = '4px 0';
      pickerDiv.innerHTML = `
        <label style="font-size: 11px;">
          ${categoryName}:
          <input type="color" 
                 value="${currentColor}" 
                 data-category="${categoryName}" 
                 data-index="${actualIndex}"
                 data-drill="true"
                 onchange="onColorChange(this)">
          <span style="font-size: 10px; color: #666;">(idx: ${actualIndex})</span>
        </label>
      `;
      drillDiv.appendChild(pickerDiv);
    });
  }
}

function onColorChange(input) {
  const category = input.dataset.category;
  const index = parseInt(input.dataset.index);
  const isDrill = input.dataset.drill === 'true';
  const color = input.value;
  
  log(`Color changed: category=${category}, index=${index}, isDrill=${isDrill}, color=${color}`);
  
  // Simular cómo Power BI guarda el color en categoryObjects
  const categoryIndex = isDrill ? 1 : 0;
  const objectName = isDrill ? "dataPointDrill" : "dataPoint";
  const categories = currentDataView.categorical.categories[categoryIndex];
  
  // Inicializar objects array si no existe
  if (!categories.objects) {
    categories.objects = [];
  }
  
  // Rellenar con nulls hasta el índice necesario
  while (categories.objects.length <= index) {
    categories.objects.push(null);
  }
  
  // Guardar el color en el índice específico
  categories.objects[index] = {
    [objectName]: {
      fill: {
        solid: {
          color: color
        }
      }
    }
  };
  
  log('categoryObjects after change:', categories.objects);
  
  // Re-renderizar
  updateChart();
}

// Start when page loads
document.addEventListener('DOMContentLoaded', init);